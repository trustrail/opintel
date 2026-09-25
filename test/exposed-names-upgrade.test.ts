import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';

it('renames populated catalogue columns and historical diffs without changing names or guards, reversibly', async () => {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    const schema = 'exposed_' + randomUUID().replaceAll('-', '');
    await db.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public`);
    await db.query(`CREATE TABLE data_source(duckdb_alias text);
      CREATE TABLE catalog_object(duckdb_schema text,duckdb_name text,name_revision int);
      CREATE TABLE catalog_element(duckdb_name text,duckdb_type text,name_revision int);
      CREATE TABLE introspection_run(diff jsonb);
      CREATE FUNCTION preserve_catalog_duckdb_name() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE FUNCTION guard_source_alias() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER names BEFORE UPDATE ON catalog_element FOR EACH ROW EXECUTE FUNCTION preserve_catalog_duckdb_name();
      CREATE TRIGGER aliases BEFORE UPDATE ON data_source FOR EACH ROW EXECUTE FUNCTION guard_source_alias();
      INSERT INTO data_source VALUES('warehouse');
      INSERT INTO catalog_element VALUES('original','INTEGER',0);
      INSERT INTO introspection_run VALUES('[{"duckdbName":"removed_name","change":"removed"}]');`);
    const migration = async (direction: string): Promise<void> => { await db.query(await readFile(new URL(`../migrations/034_exposed_names.${direction}.sql`, import.meta.url), 'utf8')); };
    await migration('up');
    expect((await db.query('SELECT exposed_name,exposed_type FROM catalog_element')).rows).toEqual([{exposed_name:'original',exposed_type:'INTEGER'}]);
    expect((await db.query('SELECT diff FROM introspection_run')).rows[0].diff).toEqual([{exposedName:'removed_name',change:'removed'}]);
    for (const sql of ["UPDATE catalog_element SET exposed_name='renamed'", "UPDATE data_source SET exposed_alias='changed'"]) {
      await db.query('SAVEPOINT refusal');
      await expect(db.query(sql)).rejects.toMatchObject({code:'23514'});
      await db.query('ROLLBACK TO SAVEPOINT refusal');
    }
    await db.query("UPDATE catalog_element SET exposed_name='adopted',name_revision=1");
    await migration('down');
    expect((await db.query('SELECT duckdb_name FROM catalog_element')).rows[0].duckdb_name).toBe('adopted');
    expect((await db.query('SELECT diff FROM introspection_run')).rows[0].diff).toEqual([{duckdbName:'removed_name',change:'removed'}]);
    await migration('up');
  } finally { await db.query('ROLLBACK'); await db.end(); }
}, 30_000);
