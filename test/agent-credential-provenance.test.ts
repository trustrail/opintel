import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {expect,it} from 'vitest';
import {presenceFixture,unwrap} from './fixtures/agent-presence/fixture.js';
import {withTenant} from '../src/platform/db/scope.js';

// Unit-test the database predicate at PostgreSQL's native timestamp precision.
it.each([{offset:'-1 microsecond',expected:false},{offset:'0 microseconds',expected:true},{offset:'1 microsecond',expected:true}])('CRED-008 cutoff $offset is credentialed=$expected',async({offset,expected})=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{expect((await db.query<{credentialed:boolean}>("SELECT public.is_credential_authentication(applied_at + $1::interval) AS credentialed FROM schema_migration WHERE version='072'",[offset])).rows).toEqual([{credentialed:expected}]);}finally{await db.end();}
});
it('CRED-008 last authentication resolves its key, including revoked versions; legacy is not backfilled',async()=>{
 const f=await presenceFixture();const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{
  const cutoff=(await db.query<{at:string}>("SELECT applied_at::text AS at FROM schema_migration WHERE version='072'")).rows[0]!.at;
  for(const agent of ['before','at','after'])unwrap(await f.signal('request',agent));
  await withTenant(f.ctx,async tx=>{
   for(const [agent,offset] of [['before','-1 microsecond'],['at','0 microseconds'],['after','1 microsecond']])await tx.query('UPDATE agent_presence SET last_seen=$3::timestamptz + $4::interval WHERE pool_id=$1 AND agent_id=$2',[f.pool,agent,cutoff,offset]);
   await tx.query("UPDATE pool_key SET state='revoked' WHERE id=$1",[f.keyVersion]);
  });
  const [key]=await withTenant(f.ctx,tx=>tx.query<{id:string;label:string;custodyAlias:string}>(`SELECT c.id,c.label,k.custody_alias AS "custodyAlias" FROM pool_key k JOIN pool_credential c ON c.id=k.credential_id WHERE k.id=$1`,[f.keyVersion]));
  const rows=await f.list();expect(rows.find(r=>r.agentId==='before')).not.toHaveProperty('credential');
  expect(rows.find(r=>r.agentId==='at')?.credential).toEqual(key);expect(rows.find(r=>r.agentId==='after')?.credential).toEqual(key);
  expect(await withTenant(f.ctx,tx=>tx.query("SELECT has_table_privilege(current_user,'schema_migration','SELECT') AS ledger"))).toEqual([{ledger:false}]);
 }finally{await db.end();}
});
it('078 up/down/up exposes only the cutoff predicate, without presence columns or ledger grants',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 const up=await readFile('migrations/078_agent_credential_provenance.up.sql','utf8'),down=await readFile('migrations/078_agent_credential_provenance.down.sql','utf8');
 try{await db.query('BEGIN');await db.query(down);expect((await db.query("SELECT to_regprocedure('public.is_credential_authentication(timestamptz)') AS predicate")).rows).toEqual([{predicate:null}]);await db.query(up);
  expect((await db.query("SELECT has_function_privilege('opintel_app','public.is_credential_authentication(timestamptz)','EXECUTE') AS app,has_function_privilege('opintel_platform','public.is_credential_authentication(timestamptz)','EXECUTE') AS platform,has_table_privilege('opintel_app','schema_migration','SELECT') AS ledger")).rows).toEqual([{app:true,platform:false,ledger:false}]);
 }finally{await db.query('ROLLBACK');await db.end();}
},60_000);
