import {createHash,randomUUID} from 'node:crypto';
import {copyFile,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {Client} from 'pg';
import {expect,it} from 'vitest';
import {migrateDown,migrateUp,migrationStatus,type MigrationReporter} from '../src/platform/db/migrate.js';
const applied049='c955644191579330232bd09cb381e765a1071a592a0153ead2958316d01e5372';
const silent:MigrationReporter={applied:()=>{},reverted:()=>{},idle:()=>{}};
it('049 retains the exact bytes already applied in development',async()=>{
 expect(createHash('sha256').update(await readFile('migrations/049_evidence_exports.up.sql')).digest('hex')).toBe(applied049);
});
it('an original 049 ledger upgrades through 050–053 without checksum repair, data loss or grant changes',async()=>{
 // Separate disposable database: exercise real migration commits and the checksum
 // guard, rather than replacing the ledger in an already-corrected test database.
 const url=new URL(process.env.TEST_DATABASE_URL!);
 const admin=new Client({connectionString:url.toString()});await admin.connect();
 const name='opintel_upgrade_'+randomUUID().replaceAll('-','');
 url.pathname='/'+name;const db=new Client({connectionString:url.toString()});
 // Sibling of migrations keeps code migration 026's relative imports intact.
 const directory=await mkdtemp(path.resolve('.migration-upgrade-'));
 let created=false,connected=false;
 try{
  await admin.query(`CREATE DATABASE "${name}"`);created=true;await db.connect();connected=true;
  const files=(await readdir('migrations')).filter(f=>/^\d+_.*\.(up|down)\.(sql|ts)$/.test(f));
  for(const file of files.filter(f=>f.slice(0,3)<='049'))await copyFile(path.join('migrations',file),path.join(directory,file));
  await migrateUp(db,directory,silent);
  const original=(await migrationStatus(db)).find(m=>m.version==='049');expect(original?.checksum).toBe(applied049);
  const policies=async()=> (await db.query<{tablename:string;policyname:string;cmd:string;qual:string|null;with_check:string|null}>("SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('evidence_export','evidence_export_request') ORDER BY tablename,policyname")).rows;
  const grants=async()=> (await db.query("SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('evidence_export','evidence_export_request') ORDER BY table_name,grantee,privilege_type")).rows;
  const oldPolicies=await policies(),oldGrants=await grants();expect(oldPolicies.filter(p=>p.policyname==='tenant_write').map(p=>p.cmd)).toEqual(['ALL','ALL']);
  const {rows:[company]}=await db.query("INSERT INTO company(name,default_region) VALUES('Migration fixture','eu-west-1') RETURNING id");
  const {rows:[project]}=await db.query("INSERT INTO project(company_id,industry_id,name,region) SELECT $1,id,'Migration fixture','eu-west-1' FROM industry WHERE slug='general' RETURNING id",[company.id]);
  const {rows:[descriptor]}=await db.query("INSERT INTO evidence_export(project_id,actor_id,format,filters,signing_key) VALUES($1,$2,'ndjson','{}','fixture') RETURNING *",[project.id,randomUUID()]);
  const {rows:[receipt]}=await db.query("INSERT INTO evidence_export_request(project_id,actor_id,request_key,body_hash,export_id) VALUES($1,$2,'fixture','fixture',$3) RETURNING *",[project.id,descriptor.actor_id,descriptor.id]);
  for(const file of files.filter(f=>f.slice(0,3)>'049'&&f.slice(0,3)<='053'))await copyFile(path.join('migrations',file),path.join(directory,file));
  expect((await migrateUp(db,directory,silent)).map(m=>m.version)).toEqual(['050','051','052','053']);
  expect((await migrationStatus(db)).find(m=>m.version==='049')).toEqual(original);
  const assertCorrected=async()=>{
   const rows=await policies();expect(rows.map(p=>[p.tablename,p.policyname,p.cmd])).toEqual([
    ['evidence_export','tenant_read','SELECT'],['evidence_export','tenant_write','INSERT'],
    ['evidence_export_request','tenant_read','SELECT'],['evidence_export_request','tenant_update','UPDATE'],['evidence_export_request','tenant_write','INSERT'],
   ]);
   for(const p of rows)for(const expression of p.cmd==='SELECT'?[p.qual]:p.cmd==='INSERT'?[p.with_check]:[p.qual,p.with_check]){expect(expression).toContain('app.project_id');expect(expression).toContain('app.user_id');}
   expect(await grants()).toEqual(oldGrants);
   expect((await db.query('SELECT * FROM evidence_export')).rows).toEqual([descriptor]);
   expect((await db.query('SELECT * FROM evidence_export_request')).rows).toEqual([receipt]);
  };
  await assertCorrected();
  expect((await db.query('SELECT settings FROM project WHERE id=$1',[project.id])).rows[0].settings.discovery).toEqual({newElements:'rules_only',typeFamilyChange:'revert',renameHandling:'carry',adoptRenamedNames:false,valueSampling:false});
  expect((await db.query("SELECT to_regclass('query_run_'||to_char(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '3 months','YYYYMM')) IS NOT NULL AS provisioned")).rows).toEqual([{provisioned:true}]);
  for(let i=0;i<2;i++){
   expect((await migrateDown(db,directory,silent))?.version).toBe('053');expect(await policies()).toEqual(oldPolicies);expect(await grants()).toEqual(oldGrants);
   expect((await migrateUp(db,directory,silent)).map(m=>m.version)).toEqual(['053']);await assertCorrected();
  }
  expect(await migrateUp(db,directory,silent)).toHaveLength(0);
  // The pending 052 index improvement is also forward-only, in 054.
  for(const file of files.filter(f=>f.slice(0,3)==='054'))await copyFile(path.join('migrations',file),path.join(directory,file));
  expect((await migrateUp(db,directory,silent)).map(m=>m.version)).toEqual(['054']);
  expect((await db.query("SELECT indexdef FROM pg_indexes WHERE indexname='evidence_rollup_retention'")).rows[0].indexdef).toContain('(project_id, created_at, id)');
  expect((await migrateDown(db,directory,silent))?.version).toBe('054');
  expect((await db.query("SELECT to_regclass('evidence_rollup_retention') AS name")).rows).toEqual([{name:null}]);
  expect((await migrateUp(db,directory,silent)).map(m=>m.version)).toEqual(['054']);
  await assertCorrected();
 }finally{
  if(connected)await db.end();
  try{if(created)await admin.query(`DROP DATABASE "${name}"`);}finally{await admin.end();await rm(directory,{recursive:true,force:true});}
 }
},60000);
