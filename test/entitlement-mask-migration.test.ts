import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
async function migration(work:(client:Client,up:string,down:string)=>Promise<void>){
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 try{
  await client.query('BEGIN');const schema='mask_migration_'+randomUUID().replaceAll('-','');
  await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query('CREATE TABLE entitlement(pool_id uuid,element_id uuid,treatment text)');
  await work(client,await readFile('migrations/029_entitlement_masks.up.sql','utf8'),await readFile('migrations/029_entitlement_masks.down.sql','utf8'));
 }finally{await client.query('ROLLBACK');await client.end();}
}
it('mask migration runs up/down/up with existing non-masked decisions unchanged',async()=>migration(async(client,up,down)=>{
 const pair=[randomUUID(),randomUUID()];await client.query("INSERT INTO entitlement VALUES($1,$2,'clear')",pair);
 await client.query(up);expect((await client.query('SELECT mask_kind FROM entitlement')).rows).toEqual([{mask_kind:null}]);
 await client.query(down);await client.query(up);
 expect((await client.query('SELECT * FROM entitlement')).rows).toEqual([{pool_id:pair[0],element_id:pair[1],treatment:'clear',mask_kind:null}]);
}),30000);
it('mask migration refuses to guess existing masks and accepts an explicit operator backfill',async()=>migration(async(client,up)=>{
 const pair=[randomUUID(),randomUUID()];await client.query("INSERT INTO entitlement VALUES($1,$2,'masked')",pair);
 await client.query('SAVEPOINT attempt');
 await expect(client.query(up)).rejects.toThrow('explicit mask_kind backfill');
 await client.query('ROLLBACK TO SAVEPOINT attempt');
 await client.query('ALTER TABLE entitlement ADD COLUMN mask_kind text');
 await client.query("UPDATE entitlement SET mask_kind='all' WHERE pool_id=$1 AND element_id=$2",pair);
 const before=(await client.query('SELECT * FROM entitlement')).rows;
 await client.query(up);expect((await client.query('SELECT * FROM entitlement')).rows).toEqual(before);
}),30000);
