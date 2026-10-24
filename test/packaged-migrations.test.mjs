import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {bundleMigrations} from '../scripts/engine-package/migrations.mjs';
import {migrateUp,migrateDown,pendingMigrations,migrationStatus} from '../src/platform/db/migrate.ts';

const temporary=[],silent={applied(){},reverted(){},idle(){}};
afterEach(async()=>{for(const directory of temporary.splice(0))await rm(directory,{recursive:true,force:true});});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'opintel-packaged-migrations-'));temporary.push(root);
 const source=join(root,'source'),output=join(root,'output');await mkdir(source);
 const code="export default async function up(client) { await client.query('SELECT 17 AS backfill'); }\n";
 await writeFile(join(source,'001_backfill.up.ts'),code);
 await writeFile(join(source,'001_backfill.down.sql'),'SELECT 19 AS rollback;');
 return {source,output,checksum:createHash('sha256').update(code).digest('hex')};
}
function client(){
 const ledger=new Map(),statements=[];
 return {statements,async query(sql,values=[]){
  statements.push(sql);
  if(sql.startsWith('INSERT INTO schema_migration'))ledger.set(values[0],{version:values[0],name:values[1],checksum:values[2],applied_at:'2026-10-23T00:00:00Z'});
  if(sql.startsWith('DELETE FROM schema_migration'))ledger.delete(values[0]);
  return {rows:sql.includes('FROM schema_migration')&&!sql.startsWith('DELETE')?[...ledger.values()]:[]};
 }};
}
it('DEP-008: an original TS ledger upgrades to source-free bundles with the same identity and reversible execution',async()=>{
 const f=await fixture(),db=client();
 await migrateUp(db,f.source,silent);
 expect((await migrationStatus(db))[0].checksum).toBe(f.checksum);
 await bundleMigrations(f.source,f.output);
 await rm(f.source,{recursive:true});
 expect((await readdir(f.output)).sort()).toEqual(['001_backfill.down.mjs','001_backfill.up.mjs','manifest.json']);
 expect(await pendingMigrations(db,f.output)).toEqual([]);
 expect(await migrateUp(db,f.output,silent)).toEqual([]);
 await migrateDown(db,f.output,silent);
 expect(db.statements).toContain('SELECT 19 AS rollback;');
 expect(await migrateUp(db,f.output,silent)).toHaveLength(1);
 expect(db.statements.filter(sql=>sql==='SELECT 17 AS backfill')).toHaveLength(2);
 expect((await migrationStatus(db))[0].checksum).toBe(f.checksum);
});
it('DEP-008: tampered compiled bytes refuse before contacting the database',async()=>{
 const f=await fixture(),db=client();await bundleMigrations(f.source,f.output);
 await appendFile(join(f.output,'001_backfill.up.mjs'),'\nconsole.log("changed");');
 await expect(migrateUp(db,f.output,silent)).rejects.toThrow('artifact checksum mismatch');
 expect(db.statements).toEqual([]);
});
it('DEP-008: packaging an edited applied source still fails the immutable ledger check',async()=>{
 const f=await fixture(),db=client();await migrateUp(db,f.source,silent);
 await appendFile(join(f.source,'001_backfill.up.ts'),'// source changed\n');
 await bundleMigrations(f.source,f.output);
 await expect(migrateUp(db,f.output,silent)).rejects.toThrow('Checksum mismatch');
});
it('DEP-008: manifest traversal and mismatched direction names fail closed',async()=>{
 const f=await fixture(),db=client();await bundleMigrations(f.source,f.output);
 const path=join(f.output,'manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));
 manifest.migrations[0].up.file='../001_backfill.up.mjs';await writeFile(path,JSON.stringify(manifest));
 await expect(migrateUp(db,f.output,silent)).rejects.toThrow();expect(db.statements).toEqual([]);
 manifest.migrations[0].up.file='001_backfill.down.mjs';await writeFile(path,JSON.stringify(manifest));
 await expect(migrateUp(db,f.output,silent)).rejects.toThrow('filename mismatch');
});
