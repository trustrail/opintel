import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectId, SourceId } from '../src/shared/kernel/index.js';
import type { FilingParty, FilingPartyRule, PartyId, FilingPartyRuleId } from '../src/modules/ingest/index.js';
import { SpreadsheetExtractor } from '../sidecar/ingest/extract.js';
import { LocalWorkbookReader } from '../sidecar/ingest/infrastructure/workbook-reader.js';
import { LandingWatcher } from '../sidecar/ingest/watch.js';

const projectId = ProjectId(randomUUID());
const filingParty: FilingParty = { id: randomUUID() as PartyId, projectId, code: '4471', name: 'Declared filing party', active: true, decimalSeparator: ',', dateFormat: 'DD/MM/YYYY' };
const rule: FilingPartyRule = { id: randomUUID() as FilingPartyRuleId, partyId: filingParty.id, projectId, active: true, priority: 100, kind: 'premium', periodGroup: 'period',
  matchKind: 'filename_regex', pattern: '^4471_(?<period>[0-9-]+)_.+\\.(xlsx|csv|xls)$', sheet: null, sheetIndex: 1, headerRow: 1, verifyColumn: null, verifyValue: null };
const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
let directory: string;
let watcher: LandingWatcher | undefined;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'opintel-extract-test-')); });
afterEach(async () => { await watcher?.close(); watcher = undefined; vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });
const digest = async (path: string) => { const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes as Buffer); return hash.digest('hex'); };
async function inspect(path: string, customRule: FilingPartyRule = rule, customFilingParty: FilingParty = filingParty) { return extractor.inspect(path, await digest(path), customFilingParty, customRule); }
async function csv(text: string, name = 'input.csv') { const path = join(directory, name); await writeFile(path, text); return path; }
async function workbook(build: (book: ExcelJS.Workbook) => void, name = 'input.xlsx') {
  const book = new ExcelJS.Workbook(); build(book); const path = join(directory, name); await book.xlsx.writeFile(path); return path;
}
async function rows(path: string, customRule = rule, customFilingParty = filingParty) {
  const result: Array<Array<string | null>> = [];
  for await (const row of extractor.rows(path, await digest(path), customFilingParty, customRule)) { expect(row.ok).toBe(true); if (row.ok) result.push(row.value); }
  return result;
}

describe('sidecar spreadsheet extraction', () => {
  it('ING-09/11: uses the declared header and exact sheet among twelve, recording both', async () => {
    const path = await workbook((book) => {
      for (let index = 1; index <= 12; index += 1) {
        const sheet = book.addWorksheet(`Sheet ${index}`);
        sheet.addRow(['Cover title']); sheet.addRow([]); sheet.addRow(['FilingParty', 'Premium']); sheet.addRow(['4471', index]);
      }
    });
    const selected = { ...rule, sheet: 'Sheet 9', sheetIndex: null, headerRow: 3 };
    expect(await inspect(path, selected)).toMatchObject({ ok: true, value: { sheet: 'Sheet 9', sheetIndex: 9, headerRow: 3, rowCount: 1, columns: [{ name: 'FilingParty' }, { name: 'Premium' }] } });
    expect(await rows(path, selected)).toEqual([['4471', '9']]);
    expect(await inspect(path, { ...selected, sheet: 'Missing' })).toMatchObject({ ok: false, error: { message: 'The declared sheet is absent.' } });
  }, 30_000);
  it('ING-10: repeats merged data cells horizontally and vertically, but quarantines merged headers', async () => {
    const path = await workbook((book) => {
      const sheet = book.addWorksheet('Data'); sheet.addRows([['A', 'B', 'C'], ['value', null, 1], [null, null, 2]]); sheet.mergeCells('A2:B3');
    });
    expect(await rows(path)).toEqual([['value', 'value', '1'], ['value', 'value', '2']]);
    const mergedHeader = await workbook((book) => { const sheet = book.addWorksheet('Data'); sheet.addRows([['Header'], ['value']]); sheet.mergeCells('A1:B1'); }, 'merged-header.xlsx');
    expect(await inspect(mergedHeader)).toMatchObject({ ok: false, error: { message: 'The declared header row contains a merged cell.' } });
  }, 30_000);
  it('ING-12: a late mixed value makes the whole column text without changing its original values', async () => {
    const path = await csv('Amount,Label\n"1.234,56",first\n"2.345,67",second\nnot a number,third\n');
    expect(await inspect(path)).toMatchObject({ ok: true, value: { columns: [{ type: 'TEXT' }, { type: 'TEXT' }] } });
    expect(await rows(path)).toEqual([['1.234,56', 'first'], ['2.345,67', 'second'], ['not a number', 'third']]);
  });
  it('ING-13: the first fully empty row ends data, including an omitted XLSX row', async () => {
    for (const path of [await csv('A,B\n1,2\n,\nNotes,not data\n'), await workbook((book) => {
      const sheet = book.addWorksheet('Data'); sheet.getRow(1).values = ['A', 'B']; sheet.getRow(2).values = [1, 2]; sheet.getRow(4).values = ['Notes', 'not data'];
    })]) expect(await rows(path)).toEqual([['1', '2']]);
  }, 30_000);
  it('ING-14/15: generates stable blank names and suffixes duplicates without displacing real headers', async () => {
    const path = await csv('Amount,,Amount,Amount_2,column_2\n1,2,3,4,5\n');
    const result = await inspect(path);
    expect(result).toMatchObject({ ok: true, value: { columns: [
      { name: 'Amount', header: 'Amount' }, { name: 'column_2_2', header: null }, { name: 'Amount_3', header: 'Amount' }, { name: 'Amount_2' }, { name: 'column_2' },
    ] } });
    expect(await inspect(path)).toEqual(result);
  });
  it('quarantines malformed CSV quoting and invalid UTF-8 rather than replacing bytes', async () => {
    const malformed = await csv('Header\n"unterminated\n');
    expect(await inspect(malformed)).toMatchObject({ ok: false });
    const invalid = join(directory, 'invalid.csv'); await writeFile(invalid, Buffer.from([0x41, 0x0a, 0xff, 0x0a]));
    expect(await inspect(invalid)).toMatchObject({ ok: false, error: { message: 'CSV must be valid UTF-8.' } });
  });
  it('uses cached formulas, including zero, and refuses a formula without a cache', async () => {
    const cached = await workbook((book) => { const sheet = book.addWorksheet('Data'); sheet.addRows([['Value'], [{ formula: '1-1', result: 0 }]]); });
    expect(await rows(cached)).toEqual([['0']]);
    const missing = await workbook((book) => { const sheet = book.addWorksheet('Data'); sheet.addRows([['Value'], [{ formula: '1+1' }]]); }, 'no-cache.xlsx');
    expect(await inspect(missing)).toMatchObject({ ok: false, error: { message: 'A formula has no cached value.' } });
  }, 30_000);
  it('ING-18: declared locale controls exact decimals and dates regardless of host TZ', async () => {
    const path = await csv('Amount,Date\n"1.234,56",03/04/2026\n"9.876.543,21",29/02/2024\n');
    const before = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York'; const americanHost = await rows(path);
      process.env.TZ = 'Europe/Berlin'; expect(await rows(path)).toEqual(americanHost);
      expect(americanHost).toEqual([['1234.56', '2026-04-03'], ['9876543.21', '2024-02-29']]);
    } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
    expect(await rows(await csv('Date\n03/04/2026\n', 'us.csv'), rule, { ...filingParty, decimalSeparator: '.', dateFormat: 'MM/DD/YYYY' })).toEqual([['2026-03-04']]);
    expect(await inspect(path, rule, { ...filingParty, decimalSeparator: undefined })).toMatchObject({ ok: false });
    expect(await inspect(path, rule, { ...filingParty, decimalSeparator: null, dateFormat: null })).toMatchObject({ ok: false });
    expect(await inspect(path, { ...rule, sheet: null, sheetIndex: null })).toMatchObject({ ok: false });
    expect(await rows(await csv('Amount\n"1.234,56"\n', 'wrong-locale.csv'), rule, { ...filingParty, decimalSeparator: '.' })).toEqual([['1.234,56']]);
  });
  it('ING-02/16: malformed and mismatched files quarantine alone; a good sibling completes without leaking content into logs', async () => {
    const input = join(directory, 'inbox'); await mkdir(input);
    const rulesFile = join(directory, 'rules.json'); const verification = { ...rule, verifyColumn: 'FilingParty', verifyValue: '4471' };
    await writeFile(rulesFile, JSON.stringify({ filingParties: [filingParty], rules: [verification] }));
    watcher = await LandingWatcher.open({ projectId, sourceId: SourceId(randomUUID()), directory: input, stateFile: join(directory, 'state.json'), rulesFile, pollMs: 10 }, undefined, extractor);
    const logged = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await writeFile(join(input, '4471_2026-03_bad.xlsx'), 'not a zip');
    await writeFile(join(input, '4471_2026-03_content.csv'), 'FilingParty,Amount\nother-filingParty-private,1\n');
    await writeFile(join(input, '4471_2026-03_good.csv'), 'FilingParty,Amount\n4471,"1.234,56"\n');
    await writeFile(join(input, '4471_2026-03_legacy.xls'), 'legacy');
    await watcher.scan(); await watcher.scan();
    expect(watcher.records()).toHaveLength(4);
    expect(watcher.records().find((filing) => filing.path.endsWith('good.csv'))).toMatchObject({ status: 'ready', extraction: { rowCount: 1, columns: [{ name: 'FilingParty' }, { type: 'NUMERIC' }] } });
    expect(watcher.records().filter((filing) => filing.status === 'quarantined')).toHaveLength(3);
    expect(watcher.records().find((filing) => filing.path.endsWith('content.csv'))?.reason).toContain('filename attribution 4471');
    expect(watcher.records().find((filing) => filing.path.endsWith('content.csv'))?.reason).toContain('other-filingParty-private');
    expect(watcher.records().find((filing) => filing.path.endsWith('.xls'))?.reason).toContain('.xls');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('other-filingParty-private');
  }, 30_000);
  it('registers arrivals before extraction and resumes the same filing after restart', async () => {
    const input = join(directory, 'inbox'); await mkdir(input);
    const rulesFile = join(directory, 'rules.json'); const stateFile = join(directory, 'state.json');
    const zone = { projectId, sourceId: SourceId(randomUUID()), directory: input, stateFile, rulesFile, pollMs: 10 };
    await writeFile(rulesFile, JSON.stringify({ filingParties: [filingParty], rules: [rule] }));
    const observing = { inspect: async (...args: Parameters<typeof extractor.inspect>) => {
      const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as { filings: Array<{ id: string; extraction?: unknown }> };
      expect(persisted.filings).toHaveLength(1); expect(persisted.filings[0]?.extraction).toBeUndefined();
      return extractor.inspect(...args);
    } };
    watcher = await LandingWatcher.open(zone, undefined, observing);
    await writeFile(join(input, '4471_2026-03_first.csv'), 'Amount\n1\n'); await watcher.scan(); await watcher.scan();
    expect(watcher.records()[0]?.extraction).toMatchObject({ rowCount: 1 });
    const id = watcher.records()[0]!.id;
    await watcher.close(); watcher = undefined;
    // Remove only the summary to model an arrival committed before a crash.
    const state = JSON.parse(await readFile(stateFile, 'utf8')) as { filings: Array<{ extraction?: unknown }> };
    delete state.filings[0]!.extraction; await writeFile(stateFile, JSON.stringify(state));
    watcher = await LandingWatcher.open(zone, undefined, observing); await watcher.reconcile();
    expect(watcher.records()).toHaveLength(1);
    expect(watcher.records()[0]).toMatchObject({ id, extraction: { rowCount: 1 } });
  }, 30_000);
  it('ING-17: streams XLSX rows with a disk-backed shared-string index', async () => {
    const path = join(directory, 'large.xlsx');
    const book = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path, useSharedStrings: true });
    const sheet = book.addWorksheet('Data'); sheet.addRow(['Reference']).commit();
    for (let index = 0; index < 20000; index += 1) sheet.addRow([`reference-${index}`]).commit();
    await book.commit();
    expect(await inspect(path)).toMatchObject({ ok: true, value: { rowCount: 20000, columns: [{ name: 'Reference', type: 'TEXT' }] } });
    let count = 0;
    for await (const row of extractor.rows(path, await digest(path), filingParty, rule)) {
      expect(row).toEqual({ ok: true, value: [`reference-${count++}`] });
    }
    expect(count).toBe(20000);
  }, 60_000);
  it('verifies every populated content row and does not rescue an unattributed file', async () => {
    const path = await csv('FilingParty,Amount\n4471,1\nother,2\n');
    expect(await inspect(path, { ...rule, verifyColumn: 'FilingParty', verifyValue: '4471' })).toMatchObject({ ok: false });
    expect(await inspect(path, { ...rule, partyId: randomUUID() as PartyId })).toMatchObject({ ok: false });
    const prior = await digest(path); await writeFile(path, 'FilingParty,Amount\n4471,3\n');
    expect(await extractor.inspect(path, prior, filingParty, rule)).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });
  it('ING-17: streams a large CSV through inspection and row emission with bounded heap', async () => {
    const path = join(directory, 'large.csv'); const file = await open(path, 'wx');
    try { await file.writeFile('Amount,Label\n'); for (let block = 0; block < 100; block += 1) await file.writeFile(('"1.234,56",' + 'x'.repeat(2048) + '\n').repeat(1000)); } finally { await file.close(); }
    const initial = process.memoryUsage().heapUsed; let peak = initial; let count = 0;
    const hash = await digest(path);
    for await (const row of extractor.rows(path, hash, filingParty, rule)) {
      expect(row.ok).toBe(true); count += 1;
      if (count % 1000 === 0) peak = Math.max(peak, process.memoryUsage().heapUsed);
    }
    expect(count).toBe(100000); expect(peak - initial).toBeLessThan(96 * 1024 * 1024);
  }, 60000);
});
