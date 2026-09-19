import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LandingWatcher, MissingLandingStateError, type LandingZone } from '../sidecar/ingest/watch.js';
import { ProjectId, SourceId } from '../src/shared/kernel/index.js';
import { identifyFile, normalizePeriod, type Cedant, type CedantFileRule, type CedantId, type CedantFileRuleId } from '../src/modules/ingest/index.js';

const projectId = ProjectId(randomUUID());
const cedant: Cedant = { id: randomUUID() as CedantId, projectId, code: '4471', name: 'Declared cedant', active: true };
const rule: CedantFileRule = { id: randomUUID() as CedantFileRuleId, cedantId: cedant.id, projectId, matchKind: 'filename_regex',
  pattern: '^4471_(?<period>[0-9]{4}-[0-9]{1,2})_premium(?:_v[0-9]+)?\\.xlsx$', kind: 'premium', periodGroup: 'period', priority: 100, active: true };
let directory: string;
let zone: LandingZone;
let watcher: LandingWatcher | undefined;
const settle = async () => { await watcher!.scan(); await watcher!.scan(); };
const delivery = (name: string, bytes = 'opaque bytes, deliberately not a spreadsheet') => writeFile(join(zone.directory, name), bytes);
async function rules(value: CedantFileRule[]) { await writeFile(zone.rulesFile, JSON.stringify({ cedants: [cedant], rules: value })); }

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'opintel-ingest-'));
  zone = { projectId, sourceId: SourceId(randomUUID()), directory: join(directory, 'inbox'), stateFile: join(directory, 'state.json'), rulesFile: join(directory, 'rules.json'), pollMs: 10 };
  await mkdir(zone.directory); await rules([rule]);
  watcher = await LandingWatcher.open(zone);
});
afterEach(async () => { await watcher?.close(); watcher = undefined; await rm(directory, { recursive: true, force: true }); });

describe('sidecar watch and identify', () => {
  it('starts a genuine first run in an empty zone and persists its identity before any arrival', async () => {
    expect(watcher!.records()).toEqual([]);
    expect(JSON.parse(await readFile(zone.stateFile, 'utf8'))).toEqual({ version: 1, projectId, sourceId: zone.sourceId, filings: [] });
    await watcher!.close(); watcher = undefined;
    watcher = await LandingWatcher.open(zone);
    expect(watcher.records()).toEqual([]);
  });
  it.each(['root', 'nested'])('refuses missing history with files present (%s), without creating state or retaining its lock', async (location) => {
    await delivery('4471_2026-3_premium.xlsx'); await settle();
    await watcher!.close(); watcher = undefined;
    await rm(zone.stateFile);
    if (location === 'nested') {
      await mkdir(join(zone.directory, 'nested'));
      await writeFile(join(zone.directory, 'nested', 'arrival.xlsx'), 'opaque bytes');
      await rm(join(zone.directory, '4471_2026-3_premium.xlsx'));
    }
    await expect(LandingWatcher.open(zone)).rejects.toBeInstanceOf(MissingLandingStateError);
    await expect(LandingWatcher.open(zone)).rejects.toThrow('Landing state file is missing but the landing zone contains files.');
    await expect(readFile(zone.stateFile)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(zone.stateFile + '.lock')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('ING-01/02/03/04: detects arrivals, hashes opaque bytes, and durably identifies filename metadata', async () => {
    watcher!.start();
    await delivery('4471_2026-3_premium.xlsx');
    await expect.poll(() => watcher!.records().length).toBe(1);
    const [filing] = watcher!.records();
    expect(filing).toMatchObject({ status: 'ready', cedantId: cedant.id, period: '2026-03', kind: 'premium', supersedes: null,
      sha256: createHash('sha256').update('opaque bytes, deliberately not a spreadsheet').digest('hex') });
    expect(JSON.parse(await readFile(zone.stateFile, 'utf8'))).toMatchObject({ filings: [filing] });
    expect(await readFile(join(zone.directory, '4471_2026-3_premium.xlsx'), 'utf8')).toBe('opaque bytes, deliberately not a spreadsheet');
  });
  it('ING-04: kind is supplied by the matching rule, never inferred from values', async () => {
    await rules([{ ...rule, pattern: '^4471_(?<period>[^_]+)_claims\\.xlsx$', kind: 'claims' }]);
    await delivery('4471_2026-Q1_claims.xlsx'); await settle();
    expect(watcher!.records()[0]).toMatchObject({ status: 'ready', kind: 'claims', period: '2026-Q1' });
  });
  it('ING-05/06: restatements retain predecessor identity; identical redelivery is a duplicate across restart', async () => {
    await delivery('4471_2026-3_premium.xlsx', 'first'); await settle();
    const first = watcher!.records()[0]!;
    await watcher!.close(); watcher = undefined; watcher = await LandingWatcher.open(zone);
    await delivery('4471_2026-3_premium_v2.xlsx', 'changed'); await settle();
    await delivery('4471_2026-3_premium_v3.xlsx', 'first'); await settle();
    expect(watcher.records()).toEqual([
      first,
      expect.objectContaining({ status: 'ready', supersedes: first.id, duplicateOf: null }),
      expect.objectContaining({ status: 'duplicate', duplicateOf: first.id, supersedes: null }),
    ]);
    await settle(); expect(watcher.records()).toHaveLength(3);
  });
  it('ING-07: simultaneous arrivals are registered independently exactly once under concurrent scans', async () => {
    await Promise.all([delivery('4471_2026-3_premium.xlsx', 'one'), delivery('4471_2026-4_premium.xlsx', 'two')]);
    await Promise.all([watcher!.scan(), watcher!.scan(), watcher!.scan()]);
    expect(watcher!.records()).toHaveLength(2);
    expect(watcher!.records().map((filing) => filing.status)).toEqual(['ready', 'ready']);
    expect(new Set(watcher!.records().map((filing) => filing.id)).size).toBe(2);
    await expect(LandingWatcher.open(zone)).rejects.toMatchObject({ code: 'EEXIST' });
  });
  it('ING-08: zero matches quarantines with a reason and no attributed cedant', async () => {
    await delivery('unknown.xlsx'); await settle();
    expect(watcher!.records()[0]).toMatchObject({ status: 'quarantined', reason: 'No cedant rule matched.', cedantId: null, ruleIds: [] });
  });
  it('ING-08: two matching rules quarantine even for one cedant and unequal priorities', async () => {
    const other = { ...rule, id: randomUUID() as CedantFileRuleId, priority: 1 };
    await rules([rule, other]); await delivery('4471_2026-3_premium.xlsx'); await settle();
    expect(watcher!.records()[0]).toMatchObject({ status: 'quarantined', reason: 'Multiple cedant rules matched.', cedantId: null, ruleIds: [rule.id, other.id] });
  });
  it('fails safely for inactive, foreign, incomplete and invalid rules; folder matching is explicit', () => {
    for (const candidate of [{ ...rule, active: false }, { ...rule, projectId: ProjectId(randomUUID()) }, { ...rule, pattern: '[' }, { ...rule, kind: null }]) {
      expect(identifyFile(projectId, '4471_2026-3_premium.xlsx', '', [cedant], [candidate]).ok).toBe(false);
    }
    const folder: CedantFileRule = { ...rule, matchKind: 'folder', pattern: 'declared' };
    const match = identifyFile(projectId, 'unrelated.xlsx', 'declared', [cedant], [folder]);
    expect(match).toMatchObject({ ok: false, error: { message: 'The matching rule did not supply a period and kind.' } });
    expect(identifyFile(projectId, '4471_2026-3_premium.xlsx', 'declared', [cedant], [rule, folder]))
      .toMatchObject({ ok: false, error: { message: 'Multiple cedant rules matched.' } });
  });
  it('does not register a file that changes between observations', async () => {
    await delivery('4471_2026-3_premium.xlsx', 'partial'); await watcher!.scan();
    await delivery('4471_2026-3_premium.xlsx', 'complete'); await watcher!.scan();
    expect(watcher!.records()).toEqual([]); await watcher!.scan();
    expect(watcher!.records()).toHaveLength(1);
  });
  it('preserves customer period labels and never invokes host date interpretation', () => {
    expect(['2026-3', '2026/03', '2026-Q1', '03/04/2026', '2026-13', '1772323200'].map(normalizePeriod))
      .toEqual(['2026-03', '2026-03', '2026-Q1', '03/04/2026', '2026-13', '1772323200']);
  });
});
