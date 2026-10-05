import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';
it('ISO-002: 059 reserves derived domains in storage and runs up/down/up without changing stored declarations',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try {
  await db.query('BEGIN');const schema='isolated_domain_'+randomUUID().replaceAll('-','');
  await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query('CREATE TABLE catalog_element(id uuid PRIMARY KEY,token_domain text)');const id=randomUUID();
  await db.query('INSERT INTO catalog_element VALUES($1,NULL)',[id]);const up=await readFile('migrations/059_isolated_token_domains.up.sql','utf8');await db.query(up);
  await db.query("UPDATE catalog_element SET token_domain='customer'");await db.query('SAVEPOINT reserved');
  await expect(db.query("UPDATE catalog_element SET token_domain='opintelisolatedclaimed'")).rejects.toMatchObject({code:'23514'});await db.query('ROLLBACK TO SAVEPOINT reserved');
  expect((await db.query('SELECT token_domain FROM catalog_element')).rows).toEqual([{token_domain:'customer'}]);
  await db.query(await readFile('migrations/059_isolated_token_domains.down.sql','utf8'));await db.query(up);
  await db.query('UPDATE catalog_element SET token_domain=NULL');expect((await db.query('SELECT token_domain FROM catalog_element')).rows).toEqual([{token_domain:null}]);
 }finally{await db.query('ROLLBACK');await db.end();}
});
