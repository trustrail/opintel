import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
it('040 runs up/down/up with append-only history and tenant policies',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');const schema='bulk_migration_'+randomUUID().replaceAll('-','');
  await db.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public; CREATE TABLE project(id uuid PRIMARY KEY); CREATE TABLE pool(id uuid,project_id uuid,UNIQUE(id,project_id))`);
  const up=await readFile('migrations/040_bulk_entitlements.up.sql','utf8'),down=await readFile('migrations/040_bulk_entitlements.down.sql','utf8');
  await db.query(up);await db.query(down);await db.query(up);
  expect((await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname IN ('bulk_decision','bulk_entitlement_request') ORDER BY relname",[schema])).rows).toEqual([
   {relname:'bulk_decision',relrowsecurity:true,relforcerowsecurity:true},{relname:'bulk_entitlement_request',relrowsecurity:true,relforcerowsecurity:true},
  ]);
  const project=randomUUID(),pool=randomUUID();await db.query('INSERT INTO project VALUES($1)',[project]);await db.query('INSERT INTO pool VALUES($1,$2)',[pool,project]);
  for(const [treatment,justification,mask]of [['clear',null,null],['clear',' ',null],['masked',null,null],['undecided',null,null]]){
   await db.query('SAVEPOINT invalid');await expect(db.query('INSERT INTO bulk_decision(project_id,actor_id,pool_id,treatment,justification,mask_kind,count) VALUES($1,$2,$3,$4,$5,$6,1)',[project,randomUUID(),pool,treatment,justification,mask])).rejects.toMatchObject({code:'23514'});await db.query('ROLLBACK TO SAVEPOINT invalid');
  }
 }finally{await db.query('ROLLBACK');await db.end();}
},30_000);
