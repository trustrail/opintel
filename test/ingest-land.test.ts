import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { periodAsAt, type FilingParty, type PartyId, type FilingPartyRule, type FilingPartyRuleId, type LandingStrategy } from '../src/modules/ingest/index.js';
import { DomainError, FilingId, ProjectId, SourceId, err, ok, type Result } from '../src/shared/kernel/index.js';
import { VaultRef } from '../src/platform/vault/index.js';
import { PostgresLanding } from '../sidecar/ingest/infrastructure/postgres-landing.js';
import type { LandingInput, LandingSource } from '../sidecar/ingest/landing-port.js';
import { LandingWatcher } from '../sidecar/ingest/watch.js';
import { FilingLander } from '../sidecar/ingest/land.js';
import { SpreadsheetExtractor } from '../sidecar/ingest/extract.js';
import { LocalWorkbookReader } from '../sidecar/ingest/infrastructure/workbook-reader.js';
const sources: LandingSource[] = [];
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
async function fixture<T>(work: (db: Client) => Promise<T>): Promise<T> {
  // Simulated customer database. Does not bypass any application metadata scope.
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
  try { return await work(db); } finally { await db.end(); }
}
const writer = () => new PostgresLanding({ resolve: async () => process.env.TEST_DATABASE_URL! });
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
function source(strategy: LandingStrategy): LandingSource {
  const value = { sourceId: SourceId(randomUUID()), projectId: ProjectId(randomUUID()), name: `landing_${randomUUID().replaceAll('-', '')}`, credentialRef: VaultRef('vault://test/customer-landing'), strategy };
  sources.push(value); return value;
}
function input(value: LandingSource): LandingInput {
  return { source: value, filingId: FilingId(randomUUID()), partyId: randomUUID() as PartyId, partyCode: '4471', kind: 'claims', period: '2026-03', asAt: '2026-03-31',
    receivedAt: '2026-04-12T10:00:00.000Z', fileSha256: 'a'.repeat(64), supersedes: null, columns: [{ name: 'Reserve', header: 'Reserve', type: 'NUMERIC' }] };
}
async function* rows(...values: string[][]) { for (const value of values) yield ok(value); }
afterAll(async () => {
  await fixture(async (db) => {
    for (const value of sources) {
      const found = await db.query<{ schema_name: string }>('SELECT schema_name FROM _opintel_landing.sources WHERE source_id=$1', [value.sourceId]);
      if (found.rows[0]) await db.query(`DROP SCHEMA ${quote(found.rows[0].schema_name)} CASCADE`);
      for (const table of ['commits', 'groups', 'sources']) await db.query(`DELETE FROM _opintel_landing.${table} WHERE source_id=$1`, [value.sourceId]);
    }
  });
});
describe('landing into customer Postgres', () => {
  it('parses declared periods only, with calendar leap years and no receipt-date fallback', () => {
    expect(periodAsAt('2024-02', 'month_end')).toEqual(ok('2024-02-29'));
    expect(periodAsAt('1900-02', 'month_end')).toEqual(ok('1900-02-28'));
    expect(periodAsAt('2026-03', 'month_start')).toEqual(ok('2026-03-01'));
    expect(periodAsAt('2026-Q1', 'quarter_end')).toEqual(ok('2026-03-31'));
    expect(periodAsAt('2026-03-15', 'exact_date')).toEqual(ok('2026-03-15'));
    expect(periodAsAt('customer label', null)).toEqual(ok(null));
    for (const period of ['2026-13', '2026-3', '0000-01']) expect(periodAsAt(period, 'month_end')).toMatchObject({ ok: false });
    expect(periodAsAt('2026-02-29', 'exact_date')).toMatchObject({ ok: false });
    expect(periodAsAt('2026-03', 'quarter_end')).toMatchObject({ ok: false });
  });
  for (const strategy of ['append_as_at', 'table_per_filing'] as const) {
    it(`${strategy}: ING-19/20/21/22/26 preserves both reserve versions and explicit filing lineage`, async () => {
      const first = input(source(strategy)); const db = writer(); unwrap(await db.connect(first.source));
      const one = unwrap(await db.land(first, rows(['100'])));
      const second = { ...first, filingId: FilingId(randomUUID()), fileSha256: 'b'.repeat(64), supersedes: first.filingId };
      const two = unwrap(await db.land(second, rows(['125'])));
      expect(two.supersedes).toBe(one.filingId);
      expect(two.strategy).toBe(strategy);
      expect(two.landedTable === one.landedTable).toBe(strategy === 'append_as_at');
      const actual = await fixture(async (pg) => (await pg.query(`SELECT "Reserve", _opintel_filing_id, _opintel_as_at::text, _opintel_period, _opintel_file_sha256 FROM ${one.landedTable}${strategy === 'table_per_filing' ? ` UNION ALL SELECT "Reserve", _opintel_filing_id, _opintel_as_at::text, _opintel_period, _opintel_file_sha256 FROM ${two.landedTable}` : ''} ORDER BY "Reserve"`)).rows as unknown[]);
      expect(actual).toEqual([
        { Reserve: '100', _opintel_filing_id: first.filingId, _opintel_as_at: '2026-03-31', _opintel_period: '2026-03', _opintel_file_sha256: first.fileSha256 },
        { Reserve: '125', _opintel_filing_id: second.filingId, _opintel_as_at: '2026-03-31', _opintel_period: '2026-03', _opintel_file_sha256: second.fileSha256 },
      ]);
      if (strategy === 'table_per_filing') {
        expect(one.landedTable).toContain(first.filingId.replaceAll('-', ''));
        expect(await fixture(async (pg) => (await pg.query(`SELECT "Reserve" FROM ${one.landedTable}`)).rows)).toEqual([{ Reserve: '100' }]);
      }
      // A fresh writer after a commit but before local-state persistence replays,
      // never consumes the file a second time or appends duplicate rows.
      expect(unwrap(await writer().land(second, rows(['999'])))).toEqual(two);
    });
  }
  it('ING-26: append_as_at keeps original and restated reserves independently retrievable by filing ID and as-at date', async () => {
    const original = input(source('append_as_at'));
    const first = unwrap(await writer().land(original, rows(['100'], ['200'])));
    const restatement = { ...original, filingId: FilingId(randomUUID()), fileSha256: 'b'.repeat(64),
      receivedAt: '2026-05-15T10:00:00.000Z', supersedes: original.filingId };
    const second = unwrap(await writer().land(restatement, rows(['125'], ['225'])));

    expect(second.landedTable).toBe(first.landedTable);
    expect(restatement.filingId).not.toBe(original.filingId);
    // Query the customer rows after BOTH commits. A receipt or supersedes link
    // alone cannot prove that the historical reserve values are still present.
    await fixture(async (pg) => {
      for (const [filing, reserves] of [[original, ['100', '200']], [restatement, ['125', '225']]] as const) {
        const result = await pg.query(`SELECT "Reserve", _opintel_filing_id, _opintel_as_at::text AS as_at,
          _opintel_period FROM ${first.landedTable}
          WHERE _opintel_filing_id=$1 AND _opintel_as_at=$2::date ORDER BY "Reserve"`, [filing.filingId, '2026-03-31']);
        expect(result.rows).toEqual(reserves.map((Reserve) => ({ Reserve, _opintel_filing_id: filing.filingId,
          as_at: '2026-03-31', _opintel_period: '2026-03' })));
      }
      const all = await pg.query(`SELECT "Reserve", _opintel_filing_id, _opintel_as_at::text AS as_at
        FROM ${first.landedTable} ORDER BY "Reserve"`);
      expect(all.rows).toEqual([
        { Reserve: '100', _opintel_filing_id: original.filingId, as_at: '2026-03-31' },
        { Reserve: '125', _opintel_filing_id: restatement.filingId, as_at: '2026-03-31' },
        { Reserve: '200', _opintel_filing_id: original.filingId, as_at: '2026-03-31' },
        { Reserve: '225', _opintel_filing_id: restatement.filingId, as_at: '2026-03-31' },
      ]);
    });
  });
  it('ING-23/25: requires an explicit strategy and locks it locally after first commit, including across restart', async () => {
    const first = input(source('append_as_at')); unwrap(await writer().land(first, rows(['1'])));
    const different = await writer().connect({ ...first.source, strategy: 'table_per_filing' });
    expect(different).toMatchObject({ ok: false, error: { message: 'Landing strategy is append_as_at; received table_per_filing.' } });
    expect(await writer().connect({ ...first.source, strategy: undefined as unknown as LandingStrategy })).toMatchObject({ ok: false });
  });
  it('adds nullable columns, preserves omitted columns, and refuses type changes with the establishing filing', async () => {
    const first = input(source('append_as_at')); const db = writer(); const one = unwrap(await db.land(first, rows(['100'])));
    const added = { ...first, filingId: FilingId(randomUUID()), columns: [...first.columns, { name: 'Note', header: 'Note', type: 'TEXT' as const }] };
    unwrap(await db.land(added, rows(['125', 'raw'])));
    expect(await fixture(async (pg) => (await pg.query(`SELECT "Reserve", "Note" FROM ${one.landedTable} ORDER BY "Reserve"`)).rows)).toEqual([{ Reserve: '100', Note: null }, { Reserve: '125', Note: 'raw' }]);
    const changed = await db.land({ ...first, filingId: FilingId(randomUUID()), columns: [{ name: 'Reserve', header: 'Reserve', type: 'TEXT' }] }, rows(['unknown']));
    expect(changed).toMatchObject({ ok: false, error: { message: `Column "Reserve" changed from NUMERIC to TEXT; established by filing ${first.filingId}.` } });
  });
  it('ING-07: concurrent filings commit whole, and a late extraction error rolls back rows and DDL', async () => {
    const first = input(source('append_as_at')); const second = { ...first, filingId: FilingId(randomUUID()), period: '2026-04' };
    const results = await Promise.all([writer().land(first, rows(['100'], ['101'])), writer().land(second, rows(['200'], ['201']))]);
    const receipt = unwrap(results[0]!); unwrap(results[1]!);
    expect(await fixture(async (pg) => (await pg.query(`SELECT _opintel_filing_id, count(*)::int AS count FROM ${receipt.landedTable} GROUP BY 1 ORDER BY 1`)).rows)).toEqual([
      { _opintel_filing_id: first.filingId, count: 2 }, { _opintel_filing_id: second.filingId, count: 2 },
    ].sort((a, b) => a._opintel_filing_id.localeCompare(b._opintel_filing_id)));
    expect(await fixture(async (pg) => (await pg.query(`SELECT "Reserve", _opintel_filing_id FROM ${receipt.landedTable} ORDER BY "Reserve"`)).rows)).toEqual([
      { Reserve: '100', _opintel_filing_id: first.filingId }, { Reserve: '101', _opintel_filing_id: first.filingId },
      { Reserve: '200', _opintel_filing_id: second.filingId }, { Reserve: '201', _opintel_filing_id: second.filingId },
    ]);
    async function* failed() { for (let i = 0; i < 101; i++) yield ok(['300', 'new']); yield err(new DomainError('validation_failed', 'File changed during extraction.')); }
    const bad = { ...first, filingId: FilingId(randomUUID()), columns: [...first.columns, { name: 'RolledBack', header: 'RolledBack', type: 'TEXT' as const }] };
    expect(await writer().land(bad, failed())).toMatchObject({ ok: false });
    expect(await fixture(async (pg) => (await pg.query(`SELECT count(*)::int AS count FROM ${receipt.landedTable}`)).rows)).toEqual([{ count: 4 }]);
    await expect(fixture((pg) => pg.query(`SELECT "RolledBack" FROM ${receipt.landedTable}`))).rejects.toMatchObject({ code: '42703' });
    expect(await writer().land({ ...first, filingId: FilingId(randomUUID()) }, rows(['1e999999']))).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    const isolated = input(source('table_per_filing'));
    expect(await writer().land({ ...isolated, columns: bad.columns }, failed())).toMatchObject({ ok: false });
    expect(await fixture(async (pg) => (await pg.query('SELECT * FROM _opintel_landing.commits WHERE filing_id=$1', [isolated.filingId])).rows)).toEqual([]);
    expect(await fixture(async (pg) => (await pg.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [isolated.source.name])).rows)).toEqual([]);
  });
  it('ING-07/12/26: watcher lands concurrent files, quarantines drift/invalid periods, and retains refused receipts across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opintel-land-')); const zoneDir = join(directory, 'zone'); await mkdir(zoneDir);
    const value = source('append_as_at'); const filingParty: FilingParty = { id: randomUUID() as PartyId, projectId: value.projectId, code: '4471', name: 'Test', active: true, decimalSeparator: '.', dateFormat: 'YYYY-MM-DD' };
    const rule: FilingPartyRule = { id: randomUUID() as FilingPartyRuleId, partyId: filingParty.id, projectId: value.projectId, matchKind: 'filename_regex', pattern: '^4471_(?<period>[^_]+)_.+\\.csv$',
      kind: 'claims', periodGroup: 'period', priority: 1, active: true, sheetIndex: 1, headerRow: 1, periodAsAtFormat: 'month_end' };
    const zone = { directory: zoneDir, stateFile: join(directory, 'state.json'), rulesFile: join(directory, 'rules.json'), sourceId: value.sourceId, projectId: value.projectId, pollMs: 1000 };
    await writeFile(zone.rulesFile, JSON.stringify({ filingParties: [filingParty], rules: [rule] }));
    const extractor = new SpreadsheetExtractor(new LocalWorkbookReader()); let online = false;
    const lander = new FilingLander(zoneDir, value, writer(), extractor, { send: async () => online ? ok(undefined) : err(new DomainError('conflict', 'Receipt refused.')) });
    let watcher = await LandingWatcher.open(zone, undefined, extractor, lander);
    try {
      await Promise.all([writeFile(join(zoneDir, '4471_2026-03_a.csv'), 'Reserve,Code\n100,1\n101,unknown\n'), writeFile(join(zoneDir, '4471_2026-04_a.csv'), 'Reserve,Code\n125,other\n')]);
      await watcher.scan(); await watcher.scan();
      const landed = watcher.records(); expect(landed).toHaveLength(2);
      expect(landed.every((entry) => entry.landing?.registered === false && entry.landing.error === 'Receipt refused.')).toBe(true);
      const receipt = landed[0]!.landing!.receipt;
      expect(await fixture(async (pg) => (await pg.query(`SELECT "Code" FROM ${receipt.landedTable} ORDER BY "Reserve"`)).rows)).toEqual([{ Code: '1' }, { Code: 'unknown' }, { Code: 'other' }]);
      await watcher.close(); online = true; watcher = await LandingWatcher.open(zone, undefined, extractor, lander); await watcher.scan();
      expect(watcher.records().every((entry) => entry.landing?.registered)).toBe(true);
      await writeFile(join(zoneDir, '4471_2026-03_b.csv'), 'Reserve,Code\n150,restated\n');
      await watcher.scan(); await watcher.scan();
      expect(watcher.records().find((entry) => entry.path.endsWith('_b.csv'))).toMatchObject({ supersedes: landed.find((entry) => entry.period === '2026-03')!.id, landing: { registered: true } });
      await writeFile(join(zoneDir, '4471_2026-03_bad.csv'), 'Reserve,Code\ntext,wrong\n');
      await writeFile(join(zoneDir, '4471_not-a-month_bad.csv'), 'Reserve,Code\n200,wrong\n');
      await watcher.scan(); await watcher.scan();
      expect(watcher.records().filter((entry) => entry.status === 'quarantined')).toHaveLength(2);
      expect(await fixture(async (pg) => (await pg.query(`SELECT "Reserve" FROM ${receipt.landedTable} ORDER BY "Reserve"`)).rows)).toEqual([{ Reserve: '100' }, { Reserve: '101' }, { Reserve: '125' }, { Reserve: '150' }]);
    } finally { await watcher.close(); await rm(directory, { recursive: true, force: true }); }
  });
});
