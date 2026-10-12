import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {queryFixture} from './fixtures/query/fixture.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {withTenant} from '../src/platform/db/scope.js';
import {ObjectId} from '../src/shared/kernel/index.js';
// Migration round trips are functional; the guard grows with the schema chain.
it('ROW-007 seeded forward/revert, explicit grants, destructive downgrade refused',async()=>{
 const f=await queryFixture();const db=new Client({connectionString:process.env.TEST_DATABASE_URL});
 try{
  const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));
  await db.connect();await db.query('BEGIN');
  const down=await readFile('migrations/074_row_entitlements.down.sql','utf8'),up=await readFile('migrations/074_row_entitlements.up.sql','utf8');
  await db.query(down);await db.query(up);await db.query('ROLLBACK');
  const result=await new PostgresRowDecisions().save(f.ctx,f.pool,ObjectId(object!.id),'field_1 >= 1');expect(result.ok).toBe(true);
  await db.query('BEGIN');await db.query('SAVEPOINT refuse');await expect(db.query(down)).rejects.toThrow('Cannot downgrade while row decision or scoping history exists');await db.query('ROLLBACK');
 }finally{await db.end();await f.close();}
},60000);
