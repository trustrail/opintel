import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { bulkFixture } from './fixtures/bulk-entitlements/fixture.js';
import { withTenant,withPlatform } from '../src/platform/db/scope.js';
it('043 up/down/up preserves scoped enqueue grants without opening the outbox table',async()=>{
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 const up=await readFile('migrations/043_pool_binding_outbox.up.sql','utf8'),down=await readFile('migrations/043_pool_binding_outbox.down.sql','utf8');
 try{await client.query('BEGIN');for(let i=0;i<2;i++){
  await client.query(down);expect((await client.query("SELECT to_regprocedure('enqueue_pool_binding(uuid,uuid,boolean)') AS fn")).rows).toEqual([{fn:null}]);
  await client.query(up);expect((await client.query("SELECT has_function_privilege('opintel_app','enqueue_pool_binding(uuid,uuid,boolean)','EXECUTE') AS execute,has_table_privilege('opintel_app','relationship_outbox','INSERT') AS broad_write")).rows).toEqual([{execute:true,broad_write:false}]);
 }}finally{await client.query('ROLLBACK');await client.end();}
},30_000);
it('043 cannot enqueue cross-project or invented binding decisions',async()=>{
 const f=await bulkFixture(0),other=await bulkFixture(0);
 await expect(withTenant(f.ctx,tx=>tx.query('SELECT * FROM enqueue_pool_binding($1,$2,true)',[other.pool,f.source]))).rejects.toMatchObject({code:'42501'});
 await expect(withTenant(f.ctx,tx=>tx.query('SELECT * FROM enqueue_pool_binding($1,$2,true)',[f.pool,other.source]))).rejects.toMatchObject({code:'42501'});
 await expect(withTenant(f.ctx,tx=>tx.query('SELECT * FROM enqueue_pool_binding($1,$2,false)',[f.pool,f.source]))).rejects.toMatchObject({code:'23514'});
 await expect(withTenant(f.ctx,tx=>tx.query('SELECT * FROM enqueue_pool_binding($1,$2,NULL)',[f.pool,f.source]))).rejects.toMatchObject({code:'23514'});
 expect(await withPlatform(tx=>tx.query('SELECT id FROM relationship_outbox WHERE resource_id=$1 OR subject_id=$1',[f.pool]))).toEqual([]);
},30_000);
