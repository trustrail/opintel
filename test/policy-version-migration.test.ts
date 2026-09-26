import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { policyFixture } from './fixtures/policy-version/fixture.js';
it('041 runs down/up/down/up, preserves version values and reinstates all triggers',async()=>{
 const f=await policyFixture();await f.set();const version=await f.version();
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 const up=await readFile('migrations/041_entitlement_policy_version.up.sql','utf8'),down=await readFile('migrations/041_entitlement_policy_version.down.sql','utf8');
 try{
  await client.query('BEGIN');
  for(let n=0;n<2;n++){
   await client.query(down);
   expect((await client.query('SELECT policy_version FROM project WHERE id=$1',[f.ctx.projectId])).rows).toEqual([{policy_version:version+n}]);
   expect((await client.query("SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid='entitlement'::regclass AND tgname LIKE 'entitlement_policy_%'")).rows).toEqual([{count:0}]);
   await client.query(up);
   expect((await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid='entitlement'::regclass AND tgname LIKE 'entitlement_policy_%' ORDER BY tgname")).rows).toEqual([{tgname:'entitlement_policy_delete'},{tgname:'entitlement_policy_insert'},{tgname:'entitlement_policy_update'}]);
   await client.query("UPDATE entitlement SET treatment='withheld' WHERE pool_id=$1",[f.pool]);
   expect((await client.query('SELECT policy_version FROM project WHERE id=$1',[f.ctx.projectId])).rows).toEqual([{policy_version:version+n+1}]);
  }
 }finally{await client.query('ROLLBACK');await client.end();}
 expect(await f.version()).toBe(version);
},30_000);
it('041 marker rolls back to a savepoint with its entitlement effect',async()=>{
 const f=await policyFixture();await f.set();const version=await f.version();
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 try{
  await client.query('BEGIN');await client.query('SAVEPOINT attempt');
  await client.query("UPDATE entitlement SET treatment='withheld' WHERE pool_id=$1",[f.pool]);
  expect((await client.query('SELECT policy_version FROM project WHERE id=$1',[f.ctx.projectId])).rows).toEqual([{policy_version:version+1}]);
  await client.query('ROLLBACK TO SAVEPOINT attempt');
  expect((await client.query('SELECT policy_version FROM project WHERE id=$1',[f.ctx.projectId])).rows).toEqual([{policy_version:version}]);
  await client.query("UPDATE entitlement SET treatment='withheld' WHERE pool_id=$1",[f.pool]);
  expect((await client.query('SELECT policy_version FROM project WHERE id=$1',[f.ctx.projectId])).rows).toEqual([{policy_version:version+1}]);
 }finally{await client.query('ROLLBACK');await client.end();}
 expect(await f.version()).toBe(version);
},30_000);
