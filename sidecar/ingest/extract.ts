import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { DomainError, err, ok, type Result } from '../../src/shared/kernel/index.js';
import { inferCell, columnNames, type Cedant, type CedantFileRule, type CellValue, type Workbook, type WorkbookReader, type FileExtractor, type ExtractionSummary, type SheetRow, type ExtractedColumn } from '../../src/modules/ingest/index.js';
import { InvalidWorkbook } from './infrastructure/workbook-reader.js';

const refused = (message: string) => err(new DomainError('validation_failed', message));
const empty = (cells: readonly CellValue[]) => cells.every((cell) => cell === null || cell.text === '');

async function* flattened(workbook: Workbook): AsyncGenerator<SheetRow> {
  const merges = [...workbook.merges].sort((left, right) => left.firstRow - right.firstRow);
  const active: Array<{ lastRow: number; firstColumn: number; lastColumn: number; value: CellValue }> = [];
  let mergeIndex = 0; let next = 1; let anchorSize = 0;
  const expand = (number: number, cells: CellValue[]): SheetRow => {
    while (merges[mergeIndex]?.firstRow === number) {
      const merge = merges[mergeIndex++]!;
      if (active.some((entry) => entry.firstColumn <= merge.lastColumn && entry.lastColumn >= merge.firstColumn)) throw new InvalidWorkbook('Merged ranges overlap.');
      const value = cells[merge.firstColumn - 1] ?? null;
      anchorSize += value?.text.length ?? 0;
      if (anchorSize > 8 * 1024 * 1024) throw new InvalidWorkbook('Merged values exceed the extraction memory limit.');
      active.push({ ...merge, value });
    }
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const entry = active[index]!;
      for (let column = entry.firstColumn; column <= entry.lastColumn; column += 1) cells[column - 1] = entry.value;
      if (entry.lastRow === number) { anchorSize -= entry.value?.text.length ?? 0; active.splice(index, 1); }
    }
    if (cells.reduce((size, cell) => size + (cell?.text.length ?? 0), 0) > 1_048_576) throw new InvalidWorkbook('Expanded row exceeds the extraction size limit.');
    return { number, cells: Array.from(cells, (cell) => cell ?? null) };
  };
  for await (const row of workbook.rows()) {
    while (next < row.number) { yield expand(next, []); next += 1; }
    yield expand(row.number, row.cells); next = row.number + 1;
  }
  const lastMerge = merges.reduce((last, merge) => Math.max(last, merge.lastRow), 0);
  while (next <= lastMerge) { yield expand(next, []); next += 1; }
}

export class SpreadsheetExtractor implements FileExtractor {
  constructor(private readonly reader: WorkbookReader) {}
  private async open(path: string, sha256: string, cedant: Cedant, rule: CedantFileRule): Promise<Result<Workbook>> {
    if (cedant.id !== rule.cedantId || cedant.projectId !== rule.projectId || !cedant.active || !rule.active) return err(new DomainError('validation_failed', 'Extraction requires the existing active attribution.'));
    if (!['.', ','].includes(cedant.decimalSeparator ?? '') || !['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].includes(cedant.dateFormat ?? '')) return err(new DomainError('validation_failed', 'The cedant must declare a supported decimal separator and date format.'));
    const sheet = rule.sheet ?? null; const sheetIndex = rule.sheetIndex ?? null;
    if ((sheet === null) === (sheetIndex === null) || sheet === '' || (sheetIndex !== null && (!Number.isInteger(sheetIndex) || sheetIndex < 1))) return err(new DomainError('validation_failed', 'Declare exactly one sheet name or one-based sheet index.'));
    if (!Number.isInteger(rule.headerRow) || (rule.headerRow ?? 0) < 1) return err(new DomainError('validation_failed', 'The header row must be declared as a positive row number.'));
    if ((rule.verifyColumn == null) !== (rule.verifyValue == null)) return err(new DomainError('validation_failed', 'Content verification needs both a column and a value.'));
    if (!await this.unchanged(path, sha256)) return err(new DomainError('conflict', 'The file changed after identification.'));
    return this.reader.open(path, { sheet, sheetIndex });
  }
  private async unchanged(path: string, sha256: string): Promise<boolean> {
    const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes as Buffer);
    return hash.digest('hex') === sha256;
  }
  private failure(error: unknown): Result<never> { return err(new DomainError('validation_failed', error instanceof InvalidWorkbook ? error.message : 'The spreadsheet is malformed or unreadable.')); }

  async inspect(path: string, sha256: string, cedant: Cedant, rule: CedantFileRule): Promise<Result<ExtractionSummary>> {
    let workbook: Workbook | undefined;
    try {
      const opened = await this.open(path, sha256, cedant, rule); if (!opened.ok) return opened;
      workbook = opened.value;
      const headerRow = rule.headerRow!;
      if (workbook.merges.some((merge) => merge.firstRow <= headerRow && merge.lastRow >= headerRow)) return err(new DomainError('validation_failed', 'The declared header row contains a merged cell.'));
      let headers: Array<string | null> | undefined; const types: Array<ExtractedColumn['type'] | undefined> = []; let rowCount = 0; let verifyIndex = -1;
      for await (const row of flattened(workbook)) {
        if (row.number < headerRow) continue;
        if (row.number === headerRow) {
          if (empty(row.cells)) return refused('The declared header row is empty.');
          headers = row.cells.map((cell) => cell?.text ?? null);
          if (rule.verifyColumn != null) {
            const matches = headers.flatMap((header, index) => header === rule.verifyColumn ? [index] : []);
            if (matches.length !== 1) return refused('The verification column is absent or ambiguous.');
            verifyIndex = matches[0]!;
          }
          continue;
        }
        if (empty(row.cells)) break;
        if (verifyIndex >= 0 && (row.cells[verifyIndex]?.text ?? '') !== rule.verifyValue) {
          return refused(`Content disagrees with filename attribution ${cedant.code}: expected ${JSON.stringify(rule.verifyValue)}, found ${JSON.stringify(row.cells[verifyIndex]?.text ?? '')}.`);
        }
        rowCount += 1;
        for (let index = 0; index < row.cells.length; index += 1) {
          const inferred = inferCell(row.cells[index] ?? null, cedant.decimalSeparator!, cedant.dateFormat!);
          if (inferred) types[index] = types[index] === undefined || types[index] === inferred.type ? inferred.type : 'TEXT';
        }
      }
      if (!headers) return refused('The declared header row is absent.');
      if (verifyIndex >= 0 && rowCount === 0) return refused('No data rows are available to verify the existing attribution.');
      const width = Math.max(headers.length, types.length);
      const padded = Array.from({ length: width }, (_, index) => headers[index] ?? null);
      const names = columnNames(padded);
      if (!await this.unchanged(path, sha256)) return err(new DomainError('conflict', 'The file changed during extraction.'));
      return ok({ sheet: workbook.sheet, sheetIndex: workbook.sheetIndex, headerRow, rowCount,
        columns: padded.map((header, index) => ({ name: names[index]!, header, type: types[index] ?? 'TEXT' })) });
    } catch (error) { return this.failure(error); }
    finally { await workbook?.close(); }
  }

  // Re-read after inference, so a late mixed value makes every value in that
  // column text. No rows or workbook-sized value array are retained in memory.
  async *rows(path: string, sha256: string, cedant: Cedant, rule: CedantFileRule): AsyncGenerator<Result<Array<string | null>>> {
    const inspected = await this.inspect(path, sha256, cedant, rule);
    if (!inspected.ok) { yield inspected; return; }
    let workbook: Workbook | undefined;
    try {
      const opened = await this.open(path, sha256, cedant, rule); if (!opened.ok) { yield opened; return; }
      workbook = opened.value;
      for await (const row of flattened(workbook)) {
        if (row.number <= inspected.value.headerRow) continue;
        if (empty(row.cells)) break;
        yield ok(inspected.value.columns.map((column, index) => {
          const cell = row.cells[index] ?? null;
          return cell === null ? null : column.type === 'TEXT' ? cell.text : inferCell(cell, cedant.decimalSeparator!, cedant.dateFormat!)?.value ?? null;
        }));
      }
      if (!await this.unchanged(path, sha256)) yield err(new DomainError('conflict', 'The file changed during extraction.'));
    } catch (error) { yield this.failure(error); }
    finally { await workbook?.close(); }
  }
}
