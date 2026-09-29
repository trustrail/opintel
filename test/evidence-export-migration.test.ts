import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {it,expect} from 'vitest';
it('053 export policies permit only descriptor inserts and receipt inserts/updates',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{
  const policies=await db.query<{tablename:string;policyname:string;cmd:string;qual:string|null;with_check:string|null}>("SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('evidence_export','evidence_export_request') ORDER BY tablename,policyname");
  expect(policies.rows.map(({tablename,policyname,cmd})=>({tablename,policyname,cmd}))).toEqual([
   {tablename:'evidence_export',policyname:'tenant_read',cmd:'SELECT'},
   {tablename:'evidence_export',policyname:'tenant_write',cmd:'INSERT'},
   {tablename:'evidence_export_request',policyname:'tenant_read',cmd:'SELECT'},
   {tablename:'evidence_export_request',policyname:'tenant_update',cmd:'UPDATE'},
   {tablename:'evidence_export_request',policyname:'tenant_write',cmd:'INSERT'},
  ]);
  for(const policy of policies.rows){
   const predicates=policy.cmd==='SELECT'?[policy.qual]:policy.cmd==='INSERT'?[policy.with_check]:[policy.qual,policy.with_check];
   for(const predicate of predicates){expect(predicate).toContain('app.project_id');expect(predicate).toContain('app.user_id');}
  }
 }finally{await db.end();}
});
it('049 export descriptors migrate down/up twice',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();try{await db.query('BEGIN');const down=await readFile('migrations/049_evidence_exports.down.sql','utf8'),up=await readFile('migrations/049_evidence_exports.up.sql','utf8');for(let i=0;i<2;i++){await db.query(down);expect((await db.query("SELECT to_regclass('evidence_export') AS name")).rows[0]?.name).toBeNull();await db.query(up);expect((await db.query("SELECT to_regclass('evidence_export') AS name")).rows[0]?.name).toBe('evidence_export');}}finally{await db.query('ROLLBACK');await db.end();}
});
