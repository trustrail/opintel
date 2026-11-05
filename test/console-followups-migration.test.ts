import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
const owner=migrationDatabase();
it('CONSOLE-03 migrations round-trip; theme defaults to system and custody writes stay scoped',async()=>{
 const db=owner(),names=['099_personal_theme','100_presence_certificate','101_receipt_certificate','102_custody_provider_credentials','103_certificate_evidence_views'];await db.query('BEGIN');
 try{
  for(const name of [...names].reverse())await db.query(await readFile(`migrations/${name}.down.sql`,'utf8'));
  for(const name of names)await db.query(await readFile(`migrations/${name}.up.sql`,'utf8'));
  const user=await db.query('INSERT INTO user_account(id,email) VALUES($1,$2) RETURNING theme',[randomUUID(),randomUUID()+'@example.invalid']);expect(user.rows[0].theme).toBe('system');
  expect((await db.query("SELECT has_function_privilege('opintel_app','save_custody_credentials(text,jsonb)','EXECUTE') AS app,has_table_privilege('opintel_app','query_run','UPDATE') AS update,has_table_privilege('opintel_app','query_run','DELETE') AS delete")).rows).toEqual([{app:true,update:false,delete:false}]);
  await expect(db.query("SELECT save_custody_credentials('opaque','{}')")).rejects.toThrow('Tenant context required');
 }finally{await db.query('ROLLBACK');}
},60000);
