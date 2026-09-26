import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect,it } from 'vitest';

it('039 runs up/down/up, enforces masks and forced tenant RLS',async()=>{
  // Owner connection is migration DDL only, in a rollback-only private schema.
  const db=new Client({connectionString:process.env.TEST_DATABASE_URL}); await db.connect();
  try {
    await db.query('BEGIN'); const schema='rule_migration_'+randomUUID().replaceAll('-','');
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}",public`);
    await db.query('CREATE TABLE project(id uuid PRIMARY KEY); CREATE TABLE introspection_run(id uuid PRIMARY KEY,project_id uuid); CREATE TABLE data_source(id uuid,project_id uuid,UNIQUE(id,project_id)); CREATE TABLE pool(id uuid,project_id uuid,UNIQUE(id,project_id)); CREATE TABLE catalog_element(id uuid,project_id uuid,UNIQUE(id,project_id))');
    const up=await readFile('migrations/039_pattern_rules.up.sql','utf8'), down=await readFile('migrations/039_pattern_rules.down.sql','utf8');
    await db.query(up); await db.query(down); await db.query(up);
    const project=randomUUID(); await db.query('INSERT INTO project VALUES($1)',[project]);
    for (const [treatment,kind] of [['masked',null],['clear','all'],['masked','unknown']]) {
      await db.query('SAVEPOINT invalid');
      await expect(db.query("INSERT INTO pattern_rule(project_id,matcher,match_kind,treatment,mask_kind) VALUES($1,'*','name_glob',$2,$3)",[project,treatment,kind])).rejects.toMatchObject({code:'23514'});
      await db.query('ROLLBACK TO SAVEPOINT invalid');
    }
    for (const kind of ['last4','email','year','all']) await db.query("INSERT INTO pattern_rule(project_id,matcher,match_kind,treatment,mask_kind) VALUES($1,'*','name_glob','masked',$2)",[project,kind]);
    expect((await db.query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2)',[schema,['pattern_rule','introspection_completed','pattern_rule_application']])).rows)
      .toEqual(expect.arrayContaining(['pattern_rule','introspection_completed','pattern_rule_application'].map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true}))));
  } finally {await db.query('ROLLBACK'); await db.end();}
},30000);
