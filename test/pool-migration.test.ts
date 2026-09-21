import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
it('pool migration runs up, down and up without touching existing tenant data',async()=>{
 // Owner connection is confined to migration DDL in a rollback-only private schema.
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 try{
  await client.query('BEGIN');const schema='pool_migration_'+randomUUID().replaceAll('-','');
  await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET LOCAL search_path TO "${schema}",public`);
  await client.query('CREATE TABLE project(id uuid PRIMARY KEY); CREATE TABLE user_account(id uuid PRIMARY KEY); CREATE TABLE data_source(id uuid,project_id uuid,UNIQUE(id,project_id))');
  const up=await readFile(new URL('../migrations/027_pools.up.sql',import.meta.url),'utf8');
  await client.query(up);await client.query(await readFile(new URL('../migrations/027_pools.down.sql',import.meta.url),'utf8'));await client.query(up);
  expect((await client.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname IN ('pool','pool_key','pool_source_binding') ORDER BY relname",[schema])).rows).toEqual(['pool','pool_key','pool_source_binding'].map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true})));
 }finally{await client.query('ROLLBACK');await client.end();}
},30000);
