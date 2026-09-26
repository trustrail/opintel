import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { hydrateCatalogObject } from '../src/modules/catalog/index.js';
import { fixture } from './fixtures/view-compiler/input.js';

async function migration(work:(client:Client,up:string,down:string)=>Promise<void>){
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 try{
  await client.query('BEGIN');
  const schema='case_'+randomUUID().replaceAll('-','');
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(`CREATE TABLE catalog_object(id uuid PRIMARY KEY, source_id uuid,exposed_schema text,exposed_name text,
   CONSTRAINT catalog_object_source_id_duckdb_schema_duckdb_name_key UNIQUE(source_id,exposed_schema,exposed_name));
   CREATE TABLE catalog_element(id uuid PRIMARY KEY,object_id uuid,exposed_name text,
   CONSTRAINT catalog_element_object_id_duckdb_name_key UNIQUE(object_id,exposed_name));`);
  await work(client,await readFile('migrations/038_catalog_name_case.up.sql','utf8'),await readFile('migrations/038_catalog_name_case.down.sql','utf8'));
 }finally{await client.query('ROLLBACK');await client.end();}
}
async function refused(client:Client,sql:string,values:readonly unknown[],message:string){
 await client.query('SAVEPOINT refusal');
 await expect(client.query(sql,[...values])).rejects.toThrow(message);
 await client.query('ROLLBACK TO SAVEPOINT refusal');
}
it('catalogue case migration preserves rows through up/down/up, checks lowercase and independently enforces folded uniqueness',async()=>migration(async(c,up,down)=>{
 const object=randomUUID(),source=randomUUID();
 await c.query("INSERT INTO catalog_object VALUES($1,$2,'public','orders')",[object,source]);
 await c.query("INSERT INTO catalog_element VALUES($1,$2,'amount'),($3,$2,NULL)",[randomUUID(),object,randomUUID()]);
 const before=(await c.query('SELECT * FROM catalog_element ORDER BY id')).rows;
 await c.query(up);await c.query(down);await c.query(up);
 expect((await c.query('SELECT * FROM catalog_element ORDER BY id')).rows).toEqual(before);
 await refused(c,"INSERT INTO catalog_element VALUES($1,$2,'Amount')",[randomUUID(),object],'catalog_element_exposed_name_lowercase');
 await refused(c,"INSERT INTO catalog_object VALUES($1,$2,'Public','other')",[randomUUID(),source],'catalog_object_exposed_schema_lowercase');
 await refused(c,"INSERT INTO catalog_object VALUES($1,$2,'public','Orders')",[randomUUID(),source],'catalog_object_exposed_name_lowercase');
 await c.query('ALTER TABLE catalog_element DROP CONSTRAINT catalog_element_exposed_name_lowercase');
 await c.query('ALTER TABLE catalog_object DROP CONSTRAINT catalog_object_exposed_schema_lowercase, DROP CONSTRAINT catalog_object_exposed_name_lowercase');
 await refused(c,"INSERT INTO catalog_element VALUES($1,$2,'Amount')",[randomUUID(),object],'catalog_element_exposed_name_unique');
 await refused(c,"INSERT INTO catalog_object VALUES($1,$2,'PUBLIC','Orders')",[randomUUID(),source],'catalog_object_exposed_address_unique');
}),30000);
it.each(['element','schema','object'])('migration refuses incompatible existing %s names naming their ids',async(kind)=>migration(async(c,up)=>{
 const id=randomUUID();
 if(kind==='element')await c.query("INSERT INTO catalog_element VALUES($1,$2,'Amount')",[id,randomUUID()]);
 else await c.query('INSERT INTO catalog_object VALUES($1,$2,$3,$4)',[id,randomUUID(),kind==='schema'?'Public':'public',kind==='object'?'Orders':'orders']);
 await refused(c,up,[],id);
}),30000);

function rows(){
 const input=fixture([{name:'records',columns:[{name:'amount',source:'Amount',treatment:'clear'}]}]);
 return {object:input.objects[0]!.state,elements:input.elements.map(e=>({...e.state,discoveredAt:new Date(e.state.discoveredAt),removedAt:null}))};
}
it('hydration validates brands while retaining native spelling and null exposed names',()=>{
 const {object,elements}=rows();
 expect(hydrateCatalogObject({...object,objectName:'Records'},elements).ok).toBe(true);
 expect(hydrateCatalogObject(object,elements.map(e=>({...e,exposedName:null}))).ok).toBe(true);
});
it.each(['Amount','has space','select'])('hydration refuses invalid exposed brand %s in every scope',name=>{
 const {object,elements}=rows();
 expect(hydrateCatalogObject({...object,exposedName:name},elements).ok).toBe(false);
 expect(hydrateCatalogObject({...object,exposedSchema:name},elements).ok).toBe(false);
 expect(hydrateCatalogObject(object,elements.map(e=>({...e,exposedName:name}))).ok).toBe(false);
});
