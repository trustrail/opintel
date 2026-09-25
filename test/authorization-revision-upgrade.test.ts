import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';

it('preserves outbox revisions and replaces only the historical write-failure message, reversibly', async () => {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    const schema = 'revision_' + randomUUID().replaceAll('-', '');
    await db.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public;
      CREATE TABLE relationship_outbox(id int,zed_token text,last_error text);
      INSERT INTO relationship_outbox VALUES(1,'opaque-revision',NULL),(2,NULL,'SpiceDB write failed.'),(3,NULL,'Another failure.');`);
    const migration = async (direction: string): Promise<void> => { await db.query(await readFile(new URL(`../migrations/035_authorization_revision.${direction}.sql`, import.meta.url), 'utf8')); };
    await migration('up');
    expect((await db.query('SELECT * FROM relationship_outbox ORDER BY id')).rows).toEqual([
      {id:1,authorization_revision:'opaque-revision',last_error:null},
      {id:2,authorization_revision:null,last_error:'Authorization relationship write failed.'},
      {id:3,authorization_revision:null,last_error:'Another failure.'},
    ]);
    await migration('down');
    expect((await db.query('SELECT zed_token,last_error FROM relationship_outbox WHERE id=2')).rows[0]).toEqual({zed_token:null,last_error:'SpiceDB write failed.'});
    await migration('up');
  } finally { await db.query('ROLLBACK'); await db.end(); }
}, 30_000);
