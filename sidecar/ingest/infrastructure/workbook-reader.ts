import { createReadStream } from 'node:fs';
import { Transform, type Readable } from 'node:stream';
import { open, mkdtemp, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, posix } from 'node:path';
import { parse } from 'csv-parse';
import * as yauzl from 'yauzl';
import { SaxesParser, type SaxesTagPlain } from 'saxes';
import { DomainError, err, ok, type Result } from '../../../src/shared/kernel/index.js';
import type { CellValue, Merge, Workbook, WorkbookReader } from '../../../src/modules/ingest/index.js';

export class InvalidWorkbook extends Error {}
const invalid = (message: string): never => { throw new InvalidWorkbook(message); };
const integer = (value: string | undefined): number => {
  if (value === undefined || !/^\d+$/.test(value)) return invalid('Malformed spreadsheet index.');
  const result = Number(value);
  if (!Number.isSafeInteger(result)) return invalid('Malformed spreadsheet index.');
  return result;
};
function address(value: string): [number, number] {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(value);
  if (!match) return invalid('Malformed cell address.');
  const column = [...match[1]!].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
  const row = Number(match[2]);
  if (column > 16384 || row > 1048576) return invalid('Cell address exceeds XLSX limits.');
  return [row, column];
}

class Zip {
  private constructor(private readonly file: yauzl.ZipFile, readonly entries: Map<string, yauzl.Entry>) {}
  static async open(path: string): Promise<Zip> {
    const file = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => error || !zip ? reject(error) : resolve(zip)));
    const entries = new Map<string, yauzl.Entry>();
    try {
      await new Promise<void>((resolve, reject) => {
        file.on('error', reject);
        file.on('end', resolve);
        file.on('entry', (entry: yauzl.Entry) => {
          if (entries.has(entry.fileName) || entries.size >= 100000) { reject(new InvalidWorkbook('Invalid or excessive workbook parts.')); return; }
          entries.set(entry.fileName, entry); file.readEntry();
        });
        file.readEntry();
      });
      return new Zip(file, entries);
    } catch (error) { file.close(); throw error; }
  }
  async *xml<T>(name: string, configure: (parser: SaxesParser, emit: (value: T) => void) => void): AsyncGenerator<T> {
    const entry = this.entries.get(name);
    if (!entry) return invalid('A required workbook part is missing.');
    const stream = await new Promise<Readable>((resolve, reject) => this.file.openReadStream(entry, (error, source) => error || !source ? reject(error) : resolve(source)));
    const queue: T[] = [];
    const parser = new SaxesParser();
    parser.on('doctype', () => invalid('Workbook document types are not allowed.'));
    configure(parser, (value) => queue.push(value));
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        parser.write(decoder.decode(chunk, { stream: true }));
        yield* queue.splice(0);
      }
      parser.write(decoder.decode()).close(); yield* queue.splice(0);
    } finally { stream.destroy(); }
  }
  close(): void { this.file.close(); }
}

// Shared strings can be as large as the workbook. Keep them in a customer-local
// temporary index, not an array proportional to the number of rows.
class Strings {
  private count = 0;
  private offset = 0;
  private constructor(private readonly directory: string, private readonly data: FileHandle, private readonly index: FileHandle) {}
  static async open(): Promise<Strings> {
    const directory = await mkdtemp(join(tmpdir(), 'opintel-xlsx-'));
    const data = await open(join(directory, 'strings'), 'wx+', 0o600);
    try { return new Strings(directory, data, await open(join(directory, 'index'), 'wx+', 0o600)); }
    catch (error) { await data.close(); await rm(directory, { recursive: true, force: true }); throw error; }
  }
  async append(text: string): Promise<void> {
    const bytes = Buffer.from(text); const index = Buffer.alloc(12);
    index.writeBigUInt64LE(BigInt(this.offset)); index.writeUInt32LE(bytes.length, 8);
    await this.data.writeFile(bytes); await this.index.writeFile(index);
    this.offset += bytes.length; this.count += 1;
  }
  async read(id: number): Promise<string> {
    if (id < 0 || id >= this.count) return invalid('Invalid shared string reference.');
    const index = Buffer.alloc(12); await this.index.read(index, 0, 12, id * 12);
    const data = Buffer.alloc(index.readUInt32LE(8));
    await this.data.read(data, 0, data.length, Number(index.readBigUInt64LE()));
    return data.toString('utf8');
  }
  async close(): Promise<void> { await this.data.close(); await this.index.close(); await rm(this.directory, { recursive: true, force: true }); }
}

type RawCell = { ref: string; type: string; style: number; value: string; formula: boolean; cached: boolean };
function cellParser(parser: SaxesParser, emit: (value: { number: number; cells: RawCell[] }) => void): void {
  let row = 0; let previous = 0; let rowSize = 0; let cells: RawCell[] = []; let cell: RawCell | undefined; let capture = false;
  parser.on('opentag', (tag) => {
    if (tag.name === 'row') { row = integer(tag.attributes.r); if (row <= previous) invalid('Rows must be ordered.'); previous = row; cells = []; rowSize = 0; }
    if (tag.name === 'c') { cell = { ref: tag.attributes.r ?? '', type: tag.attributes.t ?? 'n', style: integer(tag.attributes.s ?? '0'), value: '', formula: false, cached: false }; }
    if (cell && tag.name === 'f') cell.formula = true;
    if (cell && (tag.name === 'v' || tag.name === 't')) { capture = true; cell.cached = true; }
  });
  parser.on('text', (text) => { if (cell && capture) { cell.value += text; rowSize += text.length; if (rowSize > 1_048_576) invalid('Row exceeds the extraction size limit.'); } });
  parser.on('closetag', (tag) => {
    if (tag.name === 'v' || tag.name === 't') capture = false;
    if (tag.name === 'c' && cell) { cells.push(cell); if (cells.length > 16384) invalid('Too many columns.'); cell = undefined; }
    if (tag.name === 'row') emit({ number: row, cells });
  });
}
function excelDate(value: string, date1904: boolean): CellValue {
  const serial = Number(value);
  if (!Number.isFinite(serial) || (!date1904 && Math.floor(serial) === 60)) return invalid('Invalid Excel date.');
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const days = date1904 || serial < 60 ? serial : serial - 1;
  const date = new Date(epoch + Math.round(days * 86400000));
  if (!Number.isFinite(date.getTime())) return invalid('Invalid Excel date.');
  if (!Number.isInteger(serial)) return { kind: 'text', text: date.toISOString().replace(/Z$/, '') };
  return { kind: 'date', text: date.toISOString().slice(0, 10) };
}

async function xlsx(path: string, selection: { sheet: string | null; sheetIndex: number | null }): Promise<Workbook> {
  const zip = await Zip.open(path); let strings: Strings | undefined;
  try {
    let date1904 = false;
    const sheets: Array<{ name: string; relationship: string }> = [];
    for await (const tag of zip.xml<SaxesTagPlain>('xl/workbook.xml', (parser, emit) => parser.on('opentag', emit))) {
      if (tag.name === 'workbookPr') date1904 = tag.attributes.date1904 === '1' || tag.attributes.date1904 === 'true';
      if (tag.name === 'sheet') sheets.push({ name: tag.attributes.name ?? '', relationship: tag.attributes['r:id'] ?? '' });
      if (sheets.length > 16384) invalid('Too many sheets.');
    }
    const index = selection.sheet === null ? (selection.sheetIndex ?? 0) - 1 : sheets.findIndex((sheet) => sheet.name === selection.sheet);
    const selected = sheets[index]; if (!selected) return invalid('The declared sheet is absent.');
    let part: string | undefined;
    for await (const tag of zip.xml<SaxesTagPlain>('xl/_rels/workbook.xml.rels', (parser, emit) => parser.on('opentag', emit))) {
      if (tag.name === 'Relationship' && tag.attributes.Id === selected.relationship) {
        if (tag.attributes.TargetMode === 'External') invalid('External worksheet relationships are not allowed.');
        const target = tag.attributes.Target ?? '';
        part = target.startsWith('/') ? target.slice(1) : posix.normalize('xl/' + target);
      }
    }
    if (!part?.startsWith('xl/')) return invalid('Invalid worksheet relationship.');
    const worksheetPart = part;
    const merges: Merge[] = [];
    for await (const range of zip.xml<string>(part, (parser, emit) => parser.on('opentag', (tag) => { if (tag.name === 'mergeCell') emit(tag.attributes.ref ?? ''); }))) {
      const [start, end] = range.split(':'); if (!start || !end) return invalid('Malformed merged range.');
      const [firstRow, firstColumn] = address(start); const [lastRow, lastColumn] = address(end);
      if (firstRow > lastRow || firstColumn > lastColumn) return invalid('Malformed merged range.');
      merges.push({ firstRow, firstColumn, lastRow, lastColumn });
      if (merges.length > 100000) return invalid('Too many merged ranges.');
    }
    const formats = new Map<number, string>(); const dateStyles = new Set<number>(); let inCellStyles = false; let styleIndex = 0;
    if (zip.entries.has('xl/styles.xml')) {
      for await (const event of zip.xml<{ open: boolean; tag: SaxesTagPlain }>('xl/styles.xml', (parser, emit) => {
        parser.on('opentag', (tag) => emit({ open: true, tag })); parser.on('closetag', (tag) => emit({ open: false, tag }));
      })) {
        const { tag } = event;
        if (tag.name === 'numFmt' && event.open) formats.set(integer(tag.attributes.numFmtId), tag.attributes.formatCode ?? '');
        if (tag.name === 'cellXfs') inCellStyles = event.open;
        if (tag.name === 'xf' && event.open && inCellStyles) {
          const id = integer(tag.attributes.numFmtId ?? '0');
          const format = (formats.get(id) ?? '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
          if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dy]/i.test(format)) dateStyles.add(styleIndex);
          styleIndex += 1;
          if (styleIndex > 65536) invalid('Too many cell styles.');
        }
        if (formats.size > 65536) invalid('Too many number formats.');
      }
    }
    if (zip.entries.has('xl/sharedStrings.xml')) {
      strings = await Strings.open();
      for await (const text of zip.xml<string>('xl/sharedStrings.xml', (parser, emit) => {
        let value = ''; let capture = false; let phonetic = false;
        parser.on('opentag', (tag) => { if (tag.name === 'si') value = ''; if (tag.name === 'rPh') phonetic = true; if (tag.name === 't' && !phonetic) capture = true; });
        parser.on('text', (text) => { if (capture) { value += text; if (value.length > 1_048_576) invalid('Shared string exceeds the extraction size limit.'); } });
        parser.on('closetag', (tag) => { if (tag.name === 't') capture = false; if (tag.name === 'rPh') phonetic = false; if (tag.name === 'si') emit(value); });
      })) await strings.append(text);
    }
    return {
      sheet: selected.name, sheetIndex: index + 1, merges,
      async *rows() {
        for await (const row of zip.xml<{ number: number; cells: RawCell[] }>(worksheetPart, cellParser)) {
          const cells: CellValue[] = []; let decodedSize = 0;
          for (const cell of row.cells) {
            const [rowNumber, column] = address(cell.ref);
            if (rowNumber !== row.number || cells[column - 1] !== undefined) return invalid('Malformed cell ordering.');
            if (cell.formula && (!cell.cached || (cell.value === '' && cell.type !== 'str'))) return invalid('A formula has no cached value.');
            let value: CellValue = null;
            if (cell.type === 'e') return invalid('The spreadsheet contains a cell error.');
            if (cell.value !== '') {
              if (cell.type === 's') value = { kind: 'text', text: strings ? await strings.read(integer(cell.value)) : invalid('Shared strings are missing.') };
              else if (cell.type === 'b') value = { kind: 'boolean', text: cell.value === '1' ? 'true' : cell.value === '0' ? 'false' : invalid('Malformed boolean cell.') };
              else if (cell.type === 'n') {
                if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(cell.value)) return invalid('Malformed numeric cell.');
                value = dateStyles.has(cell.style) ? excelDate(cell.value, date1904) : { kind: 'number', text: cell.value };
              } else if (cell.type === 'd') value = { kind: /^\d{4}-\d{2}-\d{2}$/.test(cell.value) ? 'date' : 'text', text: cell.value };
              else if (['str', 'inlineStr'].includes(cell.type)) value = { kind: 'text', text: cell.value };
              else return invalid('Unsupported cell type.');
            }
            decodedSize += value?.text.length ?? 0;
            if (decodedSize > 1_048_576) return invalid('Row exceeds the extraction size limit.');
            cells[column - 1] = value;
          }
          yield { number: row.number, cells: Array.from(cells, (cell) => cell ?? null) };
        }
      },
      async close() { zip.close(); await strings?.close(); },
    };
  } catch (error) { zip.close(); await strings?.close(); throw error; }
}

export class LocalWorkbookReader implements WorkbookReader {
  async open(path: string, selection: { sheet: string | null; sheetIndex: number | null }): Promise<Result<Workbook>> {
    try {
      const format = extname(path).toLowerCase();
      if (format === '.xlsx') return ok(await xlsx(path, selection));
      if (format !== '.csv') return err(new DomainError('validation_failed', `Unsupported spreadsheet format: ${format === '.xls' ? '.xls' : 'only .xlsx and .csv are supported'}.`));
      if (selection.sheet !== null || selection.sheetIndex !== 1) return err(new DomainError('validation_failed', 'CSV requires sheet_index 1.'));
      return ok({ sheet: 'CSV', sheetIndex: 1, merges: [], async close() {}, async *rows() {
        const input = createReadStream(path);
        const parser = parse({ bom: true, skip_empty_lines: false, relax_column_count: true, max_record_size: 1_048_576 });
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const utf8 = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            try { callback(null, decoder.decode(chunk, { stream: true })); }
            catch { callback(new InvalidWorkbook('CSV must be valid UTF-8.')); }
          },
          flush(callback) {
            try { callback(null, decoder.decode()); }
            catch { callback(new InvalidWorkbook('CSV must be valid UTF-8.')); }
          },
        });
        input.on('error', (error) => parser.destroy(error));
        utf8.on('error', (error) => parser.destroy(error)); input.pipe(utf8).pipe(parser);
        let number = 0;
        try { for await (const record of parser as AsyncIterable<string[]>) yield { number: ++number, cells: record.map((text) => text === '' ? null : { kind: 'text' as const, text }) }; }
        finally { input.destroy(); utf8.destroy(); parser.destroy(); }
      } });
    } catch (error) { return err(new DomainError('validation_failed', error instanceof InvalidWorkbook ? error.message : 'The spreadsheet is malformed or unreadable.')); }
  }
}
