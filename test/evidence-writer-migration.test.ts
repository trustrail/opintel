import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {expect,it} from 'vitest';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {policyFixture} from './fixtures/policy-version/fixture.js';
it('catalog generation advances once per transaction across objects, elements and temporal declarations, and rolls back',async()=>{
 const f=await policyFixture(),version=async()=>{const [p]=await withPlatform(tx=>tx.query<{generation:number}>('SELECT catalog_generation AS generation FROM project WHERE id=$1',[f.ctx.projectId]));return p!.generation;};
 const before=await version();
 await withTenant(f.ctx,async tx=>{
  await tx.query("UPDATE catalog_element SET description='generation test' WHERE id=$1",[f.ids[0]]);
  await tx.query("UPDATE catalog_object SET description='generation test' WHERE id=(SELECT object_id FROM catalog_element WHERE id=$1)",[f.ids[0]]);
  await tx.query("INSERT INTO catalog_schema_temporal(source_id,project_id,schema_name,source_timezone) SELECT o.source_id,o.project_id,o.schema_name,'UTC' FROM catalog_object o JOIN catalog_element e ON e.object_id=o.id WHERE e.id=$1",[f.ids[0]]);
 });
 expect(await version()).toBe(before+1);
 await withTenant(f.ctx,tx=>tx.query('DELETE FROM catalog_schema_temporal WHERE project_id=$1',[f.ctx.projectId]));expect(await version()).toBe(before+2);
 await expect(withTenant(f.ctx,async tx=>{await tx.query("UPDATE catalog_element SET description='rollback' WHERE id=$1",[f.ids[0]]);throw new Error('rollback');})).rejects.toThrow('rollback');expect(await version()).toBe(before+2);
});
it('database requires a selected version for tokenized elements and forbids a different used version',async()=>{
 const f=await policyFixture(),id=randomUUID(),at=new Date().toISOString();
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'test','query','SELECT 1',$4,$5)",[id,f.ctx.projectId,f.pool,{policy:1,vocabulary:1,catalog:1,tokenKeyVersionSelected:null},at]));
 await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO run_element(run_id,started_at,exposed_name,state,treatment) VALUES($1,$2,'field','released','tokenized')",[id,at]))).rejects.toMatchObject({code:'23514'});
 await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO run_completion(run_id,started_at,outcome,completed_at,token_key_version_used) VALUES($1,$2,'{\"kind\":\"answered\",\"rowCount\":0,\"truncated\":false}',now(),1)",[id,at]))).rejects.toMatchObject({code:'23514'});
 const pinned=randomUUID();await withTenant(f.ctx,tx=>tx.query("INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'test','query','SELECT 1',$4,$5)",[pinned,f.ctx.projectId,f.pool,{policy:1,vocabulary:1,catalog:1,tokenKeyVersionSelected:2},at]));
 await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO run_completion(run_id,started_at,outcome,completed_at,token_key_version_used) VALUES($1,$2,'{\"kind\":\"answered\",\"rowCount\":0,\"truncated\":false}',now(),1)",[pinned,at]))).rejects.toMatchObject({code:'23514'});
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO run_completion(run_id,started_at,outcome,completed_at,token_key_version_used) VALUES($1,$2,'{\"kind\":\"answered\",\"rowCount\":0,\"truncated\":false}',now(),NULL)",[pinned,at]));
});
it('047 down/up runs twice without rewriting existing immutable headers',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');const down=await readFile('migrations/047_evidence_writer.down.sql','utf8'),up=await readFile('migrations/047_evidence_writer.up.sql','utf8');
  for(let i=0;i<2;i++){await db.query(down);await db.query(up);}
  const {rows}=await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'catalog%generation%'");expect(rows[0].n).toBe(9);
 }finally{await db.query('ROLLBACK');await db.end();}
});
