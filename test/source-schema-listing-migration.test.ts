import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
const owner=migrationDatabase();
it('source schema discovery error column migrates down and up without altering source identities or scan selections',async()=>{
 const db=owner();await db.query('BEGIN');try{
 const company=randomUUID(),project=randomUUID(),source=randomUUID();await db.query("INSERT INTO company(id,name,default_region) VALUES($1,'Schema upgrade','us-east-1')",[company]);await db.query("INSERT INTO project(id,company_id,industry_id,name,region) SELECT $1,$2,id,'Schema upgrade','us-east-1' FROM industry LIMIT 1",[project,company]);await db.query("SELECT set_config('app.project_id',$1,true)",[project]);await db.query("INSERT INTO data_source(id,project_id,name,kind,credential_ref,exposed_alias,status) VALUES($1,$2,'Source','postgres','secret://sources/upgrade','upgrade','pending')",[source,project]);await db.query("INSERT INTO introspection_run(source_id,project_id,state,include_schemas) VALUES($1,$2,'complete',ARRAY['claims'])",[source,project]);
 const selection=(await db.query('SELECT source_id,include_schemas FROM introspection_run')).rows;
 const before=await db.query('SELECT id,credential_ref,engine_id,status FROM data_source ORDER BY id');
 await db.query(await readFile('migrations/092_source_schema_listing.down.sql','utf8'));
 expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='data_source' AND column_name='schema_listing_error'")).rows).toEqual([]);
 await db.query(await readFile('migrations/092_source_schema_listing.up.sql','utf8'));
 expect((await db.query('SELECT id,credential_ref,engine_id,status FROM data_source ORDER BY id')).rows).toEqual(before.rows);
 expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='data_source' AND column_name='schema_listing_error'")).rows).toEqual([{column_name:'schema_listing_error'}]);
 expect((await db.query('SELECT source_id,include_schemas FROM introspection_run')).rows).toEqual(selection);
 }finally{await db.query('ROLLBACK');}
});
