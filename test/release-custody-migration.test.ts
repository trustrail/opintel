import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
const owner=migrationDatabase();
// Migration round trips are functional; this hang guard allows for growth of the migration chain.
it('5.36: release migrations round-trip in dependency order without broadening grants',async()=>{
 const db=owner();await db.query('BEGIN');
 try{
  for(const [name,direction] of [['073_credential_lifecycle_guards','down'],['072_pool_credentials','down'],['071_release_revocation_reason','down'],['069_release_derived_signing','down'],['068_release_cleanup_scope','down'],['067_release_custody','down'],['067_release_custody','up'],['068_release_cleanup_scope','up'],['069_release_derived_signing','up'],['071_release_revocation_reason','up'],['072_pool_credentials','up'],['073_credential_lifecycle_guards','up']])await db.query(await readFile(`migrations/${name}.${direction}.sql`,'utf8'));
  const result=await db.query("SELECT has_table_privilege('opintel_app','release_event','UPDATE') AS can_update,has_table_privilege('opintel_app','release_event','DELETE') AS can_delete,has_function_privilege('opintel_app','public.pending_release_cleanup(uuid)','EXECUTE') AS can_enumerate");
  expect(result.rows).toEqual([{can_update:false,can_delete:false,can_enumerate:false}]);
 }finally{await db.query('ROLLBACK');}
},60_000);
it('5.36: downgrade refuses to destroy an outstanding release or its immutable history',async()=>{
 const db=owner();await db.query('BEGIN');
 try{
  const user=randomUUID(),project=randomUUID(),grant=randomUUID(),receipt=randomUUID();
  await db.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[user,`${user}@example.com`]);
  const company=await db.query("INSERT INTO company(name,default_region) VALUES('Custody migration','eu-west-1') RETURNING id");
  const industry=await db.query('SELECT id FROM industry LIMIT 1');
  await db.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,'Custody migration','eu-west-1')",[project,company.rows[0].id,industry.rows[0].id]);
  await db.query("INSERT INTO release_grant(id,project_id,scope_user_id,receipt_id,claims,grant_jws,expires_at,share,state) VALUES($1,$2,$3,$4,'{}','test-only',now()+interval '10 minutes',$5,'granted')",[grant,project,user,receipt,Buffer.alloc(32,1)]);
  await db.query("INSERT INTO release_event(project_id,grant_id,receipt_id,kind,occurred_at,alias) VALUES($1,$2,$3,'granted',now(),'test-alias')",[project,grant,receipt]);
  await expect(db.query(await readFile('migrations/067_release_custody.down.sql','utf8'))).rejects.toMatchObject({code:'P0001'});
 }finally{await db.query('ROLLBACK');}
});
