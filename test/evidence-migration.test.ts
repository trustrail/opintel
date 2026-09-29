import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';
it('046 down/up/down/up recreates monthly partitions with forced RLS and append-only grants',async()=>{
 // Owner is used only for migration DDL in a rollback-only transaction.
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 const up=await readFile('migrations/046_evidence.up.sql','utf8'),down=await readFile('migrations/046_evidence.down.sql','utf8');
 try {
  await db.query('BEGIN');
  for(let attempt=0;attempt<2;attempt++) {
   await db.query(down);expect((await db.query("SELECT to_regclass('query_run') AS table")).rows).toEqual([{table:null}]);
   await db.query(up);
   await db.query("SELECT public.ensure_evidence_month('2031-02-01'); SELECT public.ensure_evidence_month('2031-02-17')");
   const partitions=await db.query<{name:string;rls:boolean;forced:boolean;select:boolean;insert:boolean;update:boolean;delete:boolean}>(`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,has_table_privilege('opintel_app',c.oid,'SELECT') AS select,has_table_privilege('opintel_app',c.oid,'INSERT') AS insert,has_table_privilege('opintel_app',c.oid,'UPDATE') AS update,has_table_privilege('opintel_app',c.oid,'DELETE') AS delete FROM pg_class c JOIN pg_inherits i ON i.inhrelid=c.oid WHERE i.inhparent=ANY(ARRAY['query_run'::regclass,'run_completion'::regclass,'run_element'::regclass,'run_stage'::regclass])`);
   expect(partitions.rows).toHaveLength(16);
   for(const row of partitions.rows)expect(row).toMatchObject({rls:true,forced:true,select:true,insert:true,update:false,delete:false});
   const bounds=await db.query<{bounds:string}>("SELECT pg_get_expr(relpartbound,oid) AS bounds FROM pg_class WHERE oid='query_run_203102'::regclass");
   expect(bounds.rows[0]?.bounds).toContain('2031-02-01');expect(bounds.rows[0]?.bounds).toContain('2031-03-01');
  }
 } finally {await db.query('ROLLBACK');await db.end();}
},30000);
