import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
const database=migrationDatabase();
it('087 up/down/up preserves project predicates, role scope, grants and per-pool uniqueness',async()=>{
 const db=database(),up=await readFile('migrations/087_pool_table_policies.up.sql','utf8'),down=await readFile('migrations/087_pool_table_policies.down.sql','utf8');
 const policies=async()=>(await db.query<{policyname:string;roles:string[];cmd:string;qual:string;with_check:string|null}>("SELECT policyname,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='pool_table_binding' ORDER BY policyname")).rows;
 const grants=async()=>(await db.query<{role:string;privilege:string;allowed:boolean}>("SELECT role,privilege,has_table_privilege(role,'pool_table_binding',privilege) AS allowed FROM unnest(ARRAY['opintel_app','opintel_platform','opintel_platform_admin']) role CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege ORDER BY role,privilege")).rows;
 const constraints=async()=>(await db.query<{definition:string}>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='pool_table_binding'::regclass AND contype IN ('p','u') ORDER BY conname")).rows;
 await db.query('BEGIN');
 try{
  const before=await policies(),beforeGrants=await grants();
  expect(before.map(p=>[p.policyname,p.roles,p.cmd])).toEqual([['tenant_read',['opintel_app'],'SELECT'],['tenant_write',['opintel_app'],'ALL']]);
  for(let n=0;n<2;n++){
   await db.query(down);const original=await policies();
   expect(original.map(p=>[p.policyname,p.roles,p.cmd])).toEqual([['tenant_access',['opintel_app'],'ALL']]);
   expect(original[0]!.qual).toBe(before[0]!.qual);expect(original[0]!.with_check).toBe(before[1]!.with_check);
   expect(await grants()).toEqual(beforeGrants);
   await db.query(up);expect(await policies()).toEqual(before);expect(await grants()).toEqual(beforeGrants);
   expect(await constraints()).toEqual([{definition:'PRIMARY KEY (pool_id, object_id)'}]);
   expect((await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='pool_table_binding'::regclass")).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
  }
 }finally{await db.query('ROLLBACK');}
});
