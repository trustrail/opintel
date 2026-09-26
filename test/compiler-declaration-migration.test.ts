import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';
it('037 preserves existing rows with unknown ordinals, validates domains, and runs down/up', async () => {
  const db = new Client({connectionString:process.env.TEST_DATABASE_URL}); await db.connect();
  try {
    await db.query('BEGIN');
    const schema = 'compiler_migration_' + randomUUID().replaceAll('-','');
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}"`);
    await db.query('CREATE TABLE catalog_element(id uuid PRIMARY KEY, object_id uuid, source_identifier text)');
    const id = randomUUID(), object = randomUUID();
    await db.query("INSERT INTO catalog_element VALUES($1,$2,'existing')",[id,object]);
    const up = await readFile('migrations/037_compiler_declarations.up.sql','utf8');
    await db.query(up);
    expect((await db.query('SELECT * FROM catalog_element')).rows).toEqual([{id,object_id:object,source_identifier:'existing',ordinal:null,token_domain:null,case_insensitive:null}]);
    for (const domain of ['', 'bad_domain', 'UPPER', 'sentinel', 'valid\n']) {
      await db.query('SAVEPOINT invalid');
      await expect(db.query('UPDATE catalog_element SET token_domain=$1',[domain])).rejects.toMatchObject({code:'23514'});
      await db.query('ROLLBACK TO SAVEPOINT invalid');
    }
    await db.query("UPDATE catalog_element SET ordinal=3,token_domain='customer1',case_insensitive=false");
    expect((await db.query('SELECT ordinal,token_domain,case_insensitive FROM catalog_element')).rows).toEqual([{ordinal:3,token_domain:'customer1',case_insensitive:false}]);
    await db.query(await readFile('migrations/037_compiler_declarations.down.sql','utf8'));
    expect((await db.query('SELECT * FROM catalog_element')).rows).toEqual([{id,object_id:object,source_identifier:'existing'}]);
    await db.query(up);
  } finally { await db.query('ROLLBACK'); await db.end(); }
},30000);
