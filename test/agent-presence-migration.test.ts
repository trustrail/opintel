import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { presenceFixture,unwrap } from './fixtures/agent-presence/fixture.js';
import { withTenant } from '../src/platform/db/scope.js';
 // Migration round trips are functional; this hang guard allows for growth of the migration chain.
it('044 up/down/up enforces retained presence grants and RLS',async()=>{
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 const up=await readFile('migrations/044_agent_presence.up.sql','utf8'),down=await readFile('migrations/044_agent_presence.down.sql','utf8');
 try{await client.query('BEGIN');for(let i=0;i<2;i++){
  await client.query(down);expect((await client.query("SELECT to_regclass('agent_presence') AS table")).rows).toEqual([{table:null}]);await client.query(up);
  expect((await client.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='agent_presence'::regclass")).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
  expect((await client.query("SELECT has_table_privilege('opintel_app','agent_presence','DELETE') AS delete,has_table_privilege('opintel_app','agent_presence','UPDATE') AS update,has_table_privilege('opintel_platform','agent_presence','SELECT') AS platform_read")).rows).toEqual([{delete:false,update:true,platform_read:false}]);
 }}finally{await client.query('ROLLBACK');await client.end();}
},60_000);
it('Presence rejects a caller-supplied verification claim and a key from another pool/project',async()=>{
 const f=await presenceFixture(),other=await presenceFixture();unwrap(await f.signal('request'));
 await expect(withTenant(f.ctx,tx=>tx.query('UPDATE agent_presence SET key_version=$1 WHERE pool_id=$2',[other.keyVersion,f.pool]))).rejects.toMatchObject({code:'23503'});
 expect(await f.service.observeAuthenticated(f.ctx,f.auth,{kind:'request',agentId:'forged',verified:true})).toMatchObject({ok:false,error:{code:'validation_failed'}});
 expect(await withTenant(other.ctx,tx=>tx.query('SELECT * FROM agent_presence WHERE pool_id=$1',[f.pool]))).toEqual([]);
 expect(await withTenant(other.ctx,tx=>tx.query("UPDATE agent_presence SET client='forged' WHERE pool_id=$1 RETURNING *",[f.pool]))).toEqual([]);
},30_000);

it('098 up/down/up permits authenticated verification and restores the historical false constraint on rollback',async()=>{
 const f=await presenceFixture();unwrap(await f.signal('request'));
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 try{await client.query('BEGIN');
  await client.query('UPDATE agent_presence SET verified=true WHERE pool_id=$1',[f.pool]);
  await client.query(await readFile('migrations/098_authenticated_agent_presence.down.sql','utf8'));
  expect((await client.query('SELECT verified FROM agent_presence WHERE pool_id=$1',[f.pool])).rows).toEqual([{verified:false}]);
  expect((await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='agent_presence_verified_check'")).rows[0].definition).toContain('verified = false');
  await client.query(await readFile('migrations/098_authenticated_agent_presence.up.sql','utf8'));
  await client.query('UPDATE agent_presence SET verified=true WHERE pool_id=$1',[f.pool]);
  expect((await client.query('SELECT verified FROM agent_presence WHERE pool_id=$1',[f.pool])).rows).toEqual([{verified:true}]);
 }finally{await client.query('ROLLBACK');await client.end();}
});
