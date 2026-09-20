import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { PostgresLanding } from '../sidecar/ingest/infrastructure/postgres-landing.js';
import { FilingId, ProjectId, SourceId, ok } from '../src/shared/kernel/index.js';
import { VaultRef } from '../src/platform/vault/index.js';
import type { PartyId } from '../src/modules/ingest/index.js';
import type { LandingInput } from '../sidecar/ingest/landing-port.js';

const migration = (name: string) => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
describe('filing party populated upgrades', () => {
  it('renames populated application tables without changing IDs, policies, grants or keys; downgrade refuses new kinds', async () => {
    // Owner connection is restricted to isolated migration DDL fixtures.
    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
    try {
      await db.query('BEGIN'); const schema = 'party_upgrade_' + randomUUID().replaceAll('-', '');
      await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}",public`);
      await db.query('CREATE TABLE project(id uuid PRIMARY KEY); CREATE TABLE data_source(id uuid PRIMARY KEY,project_id uuid,status text,UNIQUE(id,project_id))');
      for (const name of ['017_cedant.up', '018_extraction.up', '019_landing.up']) await db.query(await migration(name));
      const project = randomUUID(); const party = randomUUID(); const rule = randomUUID();
      await db.query('INSERT INTO project VALUES ($1)', [project]);
      await db.query("SELECT set_config('app.project_id',$1,true)", [project]);
      await db.query("INSERT INTO cedant(id,project_id,code,name) VALUES ($1,$2,'4471','Existing')", [party, project]);
      await db.query("INSERT INTO cedant_file_rule(id,project_id,cedant_id,match_kind,pattern,kind) VALUES ($1,$2,$3,'folder','incoming','premium')", [rule, project, party]);
      const before = (await db.query("SELECT 'cedant'::regclass::oid AS party_oid,'cedant_file_rule'::regclass::oid AS rule_oid")).rows;
      await db.query(await migration('020_filing_party.up'));
      expect((await db.query("SELECT 'filing_party'::regclass::oid AS party_oid,'filing_party_rule'::regclass::oid AS rule_oid")).rows).toEqual(before);
      expect((await db.query('SELECT id,party_id,kind FROM filing_party_rule')).rows).toEqual([{ id: rule, party_id: party, kind: 'premium' }]);
      expect((await db.query("SELECT relforcerowsecurity, has_table_privilege('opintel_app',oid,'SELECT,INSERT,UPDATE,DELETE') AS grants FROM pg_class WHERE oid='filing_party_rule'::regclass")).rows).toEqual([{ relforcerowsecurity: true, grants: true }]);
      await db.query("UPDATE filing_party_rule SET kind='inventory' WHERE id=$1", [rule]);
      await db.query('SAVEPOINT downgrade');
      await expect(db.query(await migration('020_filing_party.down'))).rejects.toMatchObject({ code: '23514' });
      await db.query('ROLLBACK TO SAVEPOINT downgrade');
      await db.query('SAVEPOINT empty_kind');
      await expect(db.query("UPDATE filing_party_rule SET kind='' WHERE id=$1", [rule])).rejects.toMatchObject({ code: '23514' });
      await db.query('ROLLBACK TO SAVEPOINT empty_kind');
      await db.query("UPDATE filing_party_rule SET kind='premium' WHERE id=$1", [rule]);
      await db.query(await migration('020_filing_party.down'));
      expect((await db.query('SELECT id,cedant_id,kind FROM cedant_file_rule')).rows).toEqual([{ id: rule, cedant_id: party, kind: 'premium' }]);
      await db.query(await migration('020_filing_party.up'));
      await db.query(`CREATE TABLE industry(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text UNIQUE);
        CREATE TABLE vocabulary_term(scope text,industry_id uuid REFERENCES industry(id),kind text,name text,display_name text,description text,param_type text,enum_values jsonb DEFAULT '[]')`);
      await db.query("INSERT INTO industry(slug) VALUES ('reinsurance-treaty'),('general')");
      await db.query("INSERT INTO vocabulary_term(scope,industry_id,kind,name,display_name) SELECT 'industry',id,'subject','filing_party','Supplier' FROM industry WHERE slug='general'");
      await db.query(await migration('021_reinsurance_filing_vocabulary.up'));
      expect((await db.query('SELECT display_name FROM vocabulary_term ORDER BY display_name')).rows).toEqual([{ display_name: 'Cedant' }, { display_name: 'Filing kind' }, { display_name: 'Supplier' }]);
      await db.query(await migration('021_reinsurance_filing_vocabulary.down'));
      expect((await db.query('SELECT display_name FROM vocabulary_term')).rows).toEqual([{ display_name: 'Supplier' }]);
      await db.query(await migration('021_reinsurance_filing_vocabulary.up'));
    } finally { await db.query('ROLLBACK'); await db.end(); }
  }, 30_000);

  it('upgrades the populated customer primary key in place and reuses existing table names, receipts and type history', async () => {
    // A private simulated customer database keeps the historical schema fixture
    // completely separate from shared application and other landing tests.
    const owner = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await owner.connect();
    const name = 'party_upgrade_' + randomUUID().replaceAll('-', '');
    const url = new URL(process.env.TEST_DATABASE_URL!); url.pathname = '/' + name;
    let db: Client | undefined;
    try {
      await owner.query(`CREATE DATABASE "${name}"`);
      db = new Client({ connectionString: url.toString() }); await db.connect();
      const writer = new PostgresLanding({ resolve: async () => url.toString() });
      const first: LandingInput = { source: { sourceId: SourceId(randomUUID()), projectId: ProjectId(randomUUID()), name: 'Original source', credentialRef: VaultRef('vault://test/landing'), strategy: 'append_as_at' },
        filingId: FilingId(randomUUID()), partyId: randomUUID() as PartyId, partyCode: '4471', kind: 'premium', period: '2026-03', asAt: '2026-03-31', receivedAt: '2026-04-01T00:00:00.000Z', fileSha256: 'a'.repeat(64), supersedes: null,
        columns: [{ name: 'Amount', header: 'Amount', type: 'NUMERIC' }] };
      async function* rows(value: string) { yield ok([value]); }
      const result = await writer.land(first, rows('100')); if (!result.ok) throw new Error(result.error.message);
      const receipt = result.value;
      // Reconstitute the actual pre-upgrade groups layout with populated rows.
      await db.query('ALTER TABLE _opintel_landing.groups RENAME COLUMN party_id TO cedant_id');
      await db.query('ALTER TABLE _opintel_landing.groups DROP CONSTRAINT groups_kind_nonempty');
      const identity = (await db.query("SELECT conindid,conrelid FROM pg_constraint WHERE conrelid='_opintel_landing.groups'::regclass AND contype='p'")).rows;
      const history = (await db.query('SELECT columns FROM _opintel_landing.groups')).rows;
      const upgraded = new PostgresLanding({ resolve: async () => url.toString() });
      expect(await upgraded.connect({ ...first.source, name: 'Renamed source' })).toEqual(ok(undefined));
      expect((await db.query("SELECT conindid,conrelid FROM pg_constraint WHERE conrelid='_opintel_landing.groups'::regclass AND contype='p'")).rows).toEqual(identity);
      expect((await db.query('SELECT party_id,kind FROM _opintel_landing.groups')).rows).toEqual([{ party_id: first.partyId, kind: 'premium' }]);
      expect((await db.query('SELECT columns FROM _opintel_landing.groups')).rows).toEqual(history);
      expect(await upgraded.land(first, rows('999'))).toEqual(ok(receipt));
      const second = await upgraded.land({ ...first, filingId: FilingId(randomUUID()), supersedes: first.filingId, fileSha256: 'b'.repeat(64) }, rows('125'));
      expect(second).toMatchObject({ ok: true, value: { landedTable: receipt.landedTable } });
      expect((await db.query(`SELECT "Amount" FROM ${receipt.landedTable} ORDER BY "Amount"`)).rows).toEqual([{ Amount: '100' }, { Amount: '125' }]);
      const arbitrary = await upgraded.land({ ...first, filingId: FilingId(randomUUID()), kind: 'inventory' }, rows('300'));
      expect(arbitrary).toMatchObject({ ok: true, value: { kind: 'inventory' } });
      expect(await upgraded.land({ ...first, filingId: FilingId(randomUUID()), kind: '' }, rows('1'))).toMatchObject({ ok: false });
      await expect(db.query("UPDATE _opintel_landing.groups SET kind='' WHERE party_id=$1", [first.partyId])).rejects.toMatchObject({ code: '23514' });
    } finally { await db?.end(); await owner.query(`DROP DATABASE IF EXISTS "${name}"`); await owner.end(); }
  }, 30_000);
});
