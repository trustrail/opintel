import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
const owner=migrationDatabase();
it('081 up/down/up preserves the narrow worker boundary and grants no broad tenant-table read',async()=>{
 const db=owner(),up=await readFile('migrations/081_mcp_session_sweep.up.sql','utf8'),down=await readFile('migrations/081_mcp_session_sweep.down.sql','utf8');
 await db.query('BEGIN');
 try{
  await db.query(down);expect((await db.query("SELECT to_regprocedure('public.read_mcp_session_states(uuid[])') AS fn")).rows).toEqual([{fn:null}]);
  await db.query(up);
  expect((await db.query("SELECT has_function_privilege('opintel_app','public.read_mcp_session_states(uuid[])','EXECUTE') AS tenant,has_function_privilege('opintel_platform','public.read_mcp_session_states(uuid[])','EXECUTE') AS worker,has_table_privilege('opintel_platform','pool_key','SELECT') AS keys,has_table_privilege('opintel_platform','pool','SELECT') AS pools,has_table_privilege('opintel_platform','pool_credential','SELECT') AS credentials")).rows).toEqual([{tenant:false,worker:true,keys:false,pools:false,credentials:false}]);
  const fn=(await db.query("SELECT p.prosecdef,p.provolatile,p.proconfig,NOT EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_blocked,pg_get_function_result(p.oid) AS result FROM pg_proc p WHERE p.oid='public.read_mcp_session_states(uuid[])'::regprocedure")).rows[0];
  expect(fn).toMatchObject({prosecdef:true,provolatile:'s',public_blocked:true});expect(fn.proconfig.join(' ')).toContain('pg_catalog, pg_temp');
  for(const forbidden of ['hash','prefix','alias','share'])expect(fn.result).not.toContain(forbidden);
  expect((await db.query('SELECT * FROM public.read_mcp_session_states(ARRAY[]::uuid[])')).rows).toEqual([]);
 }finally{await db.query('ROLLBACK');}
});
