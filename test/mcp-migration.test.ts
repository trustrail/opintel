import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
it('045 up/down/up retains narrow digest lookup grants and adds only trusted scope identifiers',async()=>{
 const up=await readFile('migrations/045_mcp_key_context.up.sql','utf8'),down=await readFile('migrations/045_mcp_key_context.down.sql','utf8');
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');
  for(let i=0;i<2;i++){
   await db.query(down);
   expect((await db.query("SELECT pg_get_function_result('resolve_pool_key(bytea)'::regprocedure) AS result")).rows[0].result).not.toContain('scope_user_id');
   await db.query(up);
   expect((await db.query("SELECT pg_get_function_result('resolve_pool_key(bytea)'::regprocedure) AS result")).rows[0].result).toContain('key_version uuid, scope_user_id uuid');
   expect((await db.query("SELECT has_function_privilege('opintel_app','resolve_pool_key(bytea)','EXECUTE') AS tenant,has_function_privilege('opintel_platform','resolve_pool_key(bytea)','EXECUTE') AS platform,has_table_privilege('opintel_platform','pool_key','SELECT') AS broad_read")).rows).toEqual([{tenant:false,platform:true,broad_read:false}]);
  }
 }finally{await db.query('ROLLBACK');await db.end();}
},30_000);
