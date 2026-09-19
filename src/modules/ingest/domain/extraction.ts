import type { CellValue, ExtractedColumn } from './extraction-types.js';

export function dateValue(text: string, format: string): string | null {
  let year: number; let month: number; let day: number;
  const parts = format === 'YYYY-MM-DD' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!parts) return null;
  if (format === 'YYYY-MM-DD') { year = Number(parts[1]); month = Number(parts[2]); day = Number(parts[3]); }
  else { year = Number(parts[3]); month = Number(parts[format === 'DD/MM/YYYY' ? 2 : 1]); day = Number(parts[format === 'DD/MM/YYYY' ? 1 : 2]); }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function inferCell(cell: CellValue, decimalSeparator: string, dateFormat: string): { type: ExtractedColumn['type']; value: string } | null {
  if (cell === null) return null;
  if (cell.kind === 'number') return { type: 'NUMERIC', value: cell.text };
  if (cell.kind === 'boolean') return { type: 'BOOLEAN', value: cell.text };
  if (cell.kind === 'date') return { type: 'DATE', value: cell.text };
  const date = dateValue(cell.text, dateFormat);
  if (date !== null) return { type: 'DATE', value: date };
  const numeric = decimalSeparator === ','
    ? /^[+-]?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?(?:[Ee][+-]?\d+)?$/
    : /^[+-]?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?(?:[Ee][+-]?\d+)?$/;
  if (numeric.test(cell.text)) return { type: 'NUMERIC', value: decimalSeparator === ',' ? cell.text.replaceAll('.', '').replace(',', '.') : cell.text.replaceAll(',', '') };
  return { type: 'TEXT', value: cell.text };
}

export function columnNames(headers: Array<string | null>): string[] {
  // Reserve all literal headers so generated names never displace a real one.
  const reserved = new Set(headers.filter((name): name is string => name !== null && name !== ''));
  const used = new Set<string>();
  return headers.map((header, index) => {
    const generated = header === null || header === '';
    const base = generated ? `column_${index + 1}` : header;
    let candidate = base; let suffix = 2;
    while (used.has(candidate) || (generated && reserved.has(candidate)) || (candidate !== base && reserved.has(candidate))) candidate = `${base}_${suffix++}`;
    used.add(candidate); return candidate;
  });
}
