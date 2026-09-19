import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const integration = process.env.TEST_DATABASE_URL === undefined ? describe.skip : describe;
const enforcement = `ALTER TABLE cedant ALTER COLUMN decimal_separator SET NOT NULL, ALTER COLUMN date_format SET NOT NULL;
  ALTER TABLE cedant_file_rule ADD CONSTRAINT extraction_sheet_declared CHECK ((sheet IS NULL) <> (sheet_index IS NULL))`;

integration('extraction migration rollout', () => {
  it('preserves populated legacy rows, permits explicit backfill, and enforces only afterward', async () => {
    // Migration infrastructure needs an owner connection for DDL. All fixture
    // tables live in an isolated schema; the whole exercise is rolled back.
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query('BEGIN');
      const schema = 'extraction_migration_' + randomUUID().replaceAll('-', '');
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", public`);
      await client.query('CREATE TABLE project (id uuid PRIMARY KEY)');
      await client.query(await readFile(new URL('../migrations/017_cedant.up.sql', import.meta.url), 'utf8'));
      const projectId = randomUUID(); const cedantId = randomUUID(); const ruleId = randomUUID();
      await client.query('INSERT INTO project (id) VALUES ($1)', [projectId]);
      await client.query("SELECT set_config('app.project_id',$1,true)", [projectId]);
      await client.query("INSERT INTO cedant (id,project_id,code,name) VALUES ($1,$2,'4471','Legacy cedant')", [cedantId, projectId]);
      await client.query("INSERT INTO cedant_file_rule (id,project_id,cedant_id,match_kind,pattern) VALUES ($1,$2,$3,'filename_regex','^4471')", [ruleId, projectId, cedantId]);
      const up = await readFile(new URL('../migrations/018_extraction.up.sql', import.meta.url), 'utf8');
      await client.query(up);
      expect((await client.query('SELECT id,code,decimal_separator,date_format FROM cedant')).rows).toEqual([
        { id: cedantId, code: '4471', decimal_separator: null, date_format: null },
      ]);
      expect((await client.query('SELECT id,cedant_id,pattern,sheet,sheet_index,header_row FROM cedant_file_rule')).rows).toEqual([
        { id: ruleId, cedant_id: cedantId, pattern: '^4471', sheet: null, sheet_index: null, header_row: 1 },
      ]);
      await client.query('SAVEPOINT enforcement');
      await expect(client.query(enforcement)).rejects.toMatchObject({ code: '23502' });
      await client.query('ROLLBACK TO SAVEPOINT enforcement');
      await client.query("UPDATE cedant SET decimal_separator=',',date_format='DD/MM/YYYY' WHERE id=$1", [cedantId]);
      await client.query('SAVEPOINT sheet_enforcement');
      await expect(client.query(enforcement)).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK TO SAVEPOINT sheet_enforcement');
      await client.query('UPDATE cedant_file_rule SET sheet_index=1 WHERE id=$1', [ruleId]);
      await client.query(enforcement);
      expect((await client.query('SELECT decimal_separator,date_format FROM cedant')).rows).toEqual([{ decimal_separator: ',', date_format: 'DD/MM/YYYY' }]);
      await client.query(await readFile(new URL('../migrations/018_extraction.down.sql', import.meta.url), 'utf8'));
      expect((await client.query('SELECT id,cedant_id FROM cedant_file_rule')).rows).toEqual([{ id: ruleId, cedant_id: cedantId }]);
      await client.query(up);
      expect((await client.query('SELECT decimal_separator FROM cedant')).rows).toEqual([{ decimal_separator: null }]);
    } finally { await client.query('ROLLBACK'); await client.end(); }
  });
});
