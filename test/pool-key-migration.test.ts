import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { withPlatform,withTenant } from '../src/platform/db/scope.js';
import { bulkFixture } from './fixtures/bulk-entitlements/fixture.js';
it('042 up/down/up: grants, RLS and hash-only authentication bootstrap',async()=>{
 const up=await readFile('migrations/042_pool_key_commands.up.sql','utf8'),down=await readFile('migrations/042_pool_key_commands.down.sql','utf8');
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 try{
  await client.query('BEGIN');
  for(let i=0;i<2;i++){
   await client.query(down);expect((await client.query("SELECT to_regclass('pool_key_request') AS table")).rows).toEqual([{table:null}]);
   await client.query(up);
   expect((await client.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='pool_key_request'::regclass")).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
   expect((await client.query("SELECT has_function_privilege('opintel_app','resolve_pool_key(bytea)','EXECUTE') AS tenant,has_function_privilege('opintel_platform','resolve_pool_key(bytea)','EXECUTE') AS platform,has_table_privilege('opintel_platform','pool_key','SELECT') AS broad_read")).rows).toEqual([{tenant:false,platform:true,broad_read:false}]);
  }
 }finally{await client.query('ROLLBACK');await client.end();}
},30_000);
it('042 receipts forbid plaintext; isolate request metadata; bootstrap exposes no hash',async()=>{
 const a=await bulkFixture(0),b=await bulkFixture(0);
 const insert=(response:unknown)=>withTenant(a.ctx,tx=>tx.query("INSERT INTO pool_key_request(project_id,actor_id,route,request_key,body_hash,response,expires_at) VALUES($1,$2,'test','test','hash',$3::jsonb,now()+interval '24 hours')",[a.ctx.projectId,a.ctx.userId,JSON.stringify(response)]));
 await expect(insert({keyShown:true,key:'opk_live_'+'A'.repeat(22)})).rejects.toMatchObject({code:'23514'});
 await expect(insert({keyShown:false,key:'opk_live_'+'A'.repeat(22)})).rejects.toMatchObject({code:'23514'});
 await insert({keyShown:false});
 expect(await withTenant(b.ctx,tx=>tx.query('SELECT * FROM pool_key_request'))).toEqual([]);
 expect(await withPlatform(tx=>tx.query('SELECT * FROM resolve_pool_key($1)',[Buffer.alloc(32)]))).toEqual([]);
 await expect(withTenant(a.ctx,tx=>tx.query('SELECT * FROM resolve_pool_key($1)',[Buffer.alloc(32)]))).rejects.toMatchObject({code:'42501'});
},30_000);
