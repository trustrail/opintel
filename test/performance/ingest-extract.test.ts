import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectId } from '../../src/shared/kernel/index.js';
import type { FilingParty, FilingPartyRule, PartyId, FilingPartyRuleId } from '../../src/modules/ingest/index.js';
import { SpreadsheetExtractor } from '../../sidecar/ingest/extract.js';
import { LocalWorkbookReader } from '../../sidecar/ingest/infrastructure/workbook-reader.js';

const projectId = ProjectId(randomUUID());
const filingParty: FilingParty = { id: randomUUID() as PartyId, projectId, code: '4471', name: 'Declared filing party', active: true, decimalSeparator: ',', dateFormat: 'DD/MM/YYYY' };
const rule: FilingPartyRule = { id: randomUUID() as FilingPartyRuleId, partyId: filingParty.id, projectId, active: true, priority: 100, kind: 'premium', periodGroup: 'period',
  matchKind: 'filename_regex', pattern: '^4471_(?<period>[0-9-]+)_.+\\.(xlsx|csv|xls)$', sheet: null, sheetIndex: 1, headerRow: 1, verifyColumn: null, verifyValue: null };
const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'opintel-extract-performance-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const digest = async (path: string) => { const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes as Buffer); return hash.digest('hex'); };

// Keep the large-file heap proof and its existing 60-second budget intact.
// Run serially after the functional suite, without concurrent browser/load work.
describe('sidecar spreadsheet extraction resources', () => {
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
