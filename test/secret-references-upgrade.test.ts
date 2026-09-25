import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';

it('rewrites populated secret references and deployment metadata while retaining database credential constraints', async () => {
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try {
  await db.query('BEGIN');const schema='secrets_'+randomUUID().replaceAll('-','');
  await db.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public;
   CREATE TABLE company_idp(client_secret_ref text NOT NULL CONSTRAINT secret_is_reference CHECK(client_secret_ref LIKE 'vault://%'));
   CREATE TABLE data_source(origin text,credential_ref text,demo_template_id uuid,CONSTRAINT credential_matches_origin CHECK(credential_ref IS NOT NULL AND credential_ref LIKE 'vault://%' AND (origin='customer' OR (origin='demo' AND demo_template_id IS NOT NULL))));
   CREATE TABLE demo_source_template(deployment_ref jsonb);
   INSERT INTO company_idp VALUES('vault://idp/client');
   INSERT INTO data_source VALUES('customer','vault://customer/source',NULL);
   INSERT INTO demo_source_template VALUES('{"project":{"sourceId":"reserved-id","credentialRef":"vault://demo/postgres","landingZone":"/customer/inbox","sourceName":"Demo"}}'),('{}');`);
  const migration=async(direction:string):Promise<void>=>{await db.query(await readFile(new URL(`../migrations/036_secret_references.${direction}.sql`,import.meta.url),'utf8'));};
  await migration('up');
  expect((await db.query('SELECT client_secret_ref FROM company_idp')).rows).toEqual([{client_secret_ref:'secret://idp/client'}]);
  expect((await db.query('SELECT credential_ref FROM data_source')).rows).toEqual([{credential_ref:'secret://customer/source'}]);
  expect((await db.query('SELECT deployment_ref FROM demo_source_template')).rows).toEqual([
   {deployment_ref:{project:{sourceId:'reserved-id',credentialRef:'secret://demo/postgres',landingZone:'/customer/inbox',sourceName:'Demo'}}},{deployment_ref:{}},
  ]);
  for(const value of [null,'plaintext','vault://old/reference']) {
   await db.query('SAVEPOINT refusal');
   await expect(db.query("UPDATE data_source SET credential_ref=$1",[value])).rejects.toMatchObject({code:'23514'});
   await db.query('ROLLBACK TO SAVEPOINT refusal');
   await db.query('SAVEPOINT refusal');
   await expect(db.query('UPDATE company_idp SET client_secret_ref=$1',[value])).rejects.toMatchObject({code:value===null?'23502':'23514'});
   await db.query('ROLLBACK TO SAVEPOINT refusal');
  }
  await db.query("UPDATE data_source SET credential_ref='secret://changed/source'");
  await migration('down');
  expect((await db.query('SELECT credential_ref FROM data_source')).rows).toEqual([{credential_ref:'vault://changed/source'}]);
  expect((await db.query("SELECT deployment_ref->'project'->>'credentialRef' AS ref FROM demo_source_template WHERE deployment_ref ? 'project'")).rows).toEqual([{ref:'vault://demo/postgres'}]);
  await migration('up');
 }finally{await db.query('ROLLBACK');await db.end();}
},30_000);
