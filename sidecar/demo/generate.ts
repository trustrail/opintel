import { createHash } from 'node:crypto';
import type { GeneratorSpec } from '../../src/shared/demo-contract.js';
import type { DemoFile, DemoObject } from './workbook-port.js';

export function generateRows(spec: GeneratorSpec, file: DemoFile, object: DemoObject): Array<Array<string | null>> {
  const random = (row: number, column: string, salt = '') => createHash('sha256').update(`${spec.seed}:${file.id}:${row}:${column}:${salt}`).digest().readUInt32BE() / 0x100000000;
  const numeric = (value: number) => {
    const [whole, fraction] = value.toFixed(2).split('.');
    return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, file.decimalSeparator === ',' ? '.' : ',')}${file.decimalSeparator}${fraction}`;
  };
  return Array.from({ length: spec.rows[object.name]! }, (_, row) => object.columns.map((column) => {
    const option = spec.columns?.[`${object.name}.${column.name}`];
    if (column.nullable && option?.nullRate && random(row,column.name,'null') < option.nullRate) return null;
    const join = spec.joinKeys.find((key) => key.objects.includes(object.name) && key.column === column.name);
    if (join) return String(1 + row % join.cardinality).padStart(6,'0');
    if (option?.values) return option.values[Math.floor(random(row,column.name)*option.values.length)]!;
    if (/date/i.test(column.type)) {
      const day = String(13 + row % 15).padStart(2,'0');
      return file.dateFormat === 'DD/MM/YYYY' ? `${day}/03/2026` : file.dateFormat === 'MM/DD/YYYY' ? `03/${day}/2026` : `2026-03-${day}`;
    }
    if (/numeric|decimal|integer|int|real|double/i.test(column.type)) {
      const u = Math.max(random(row,column.name),0.000001);
      const distribution = option?.distribution === 'zipf' ? 1 / Math.ceil(u*20)
        : option?.distribution === 'normal' ? Math.max(0.01,0.5 + Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*random(row,column.name,'normal'))/6) : u;
      return numeric((1000+distribution*9000)*(file.supersedes ? 1.1 : 1));
    }
    if (/bool/i.test(column.type)) return row % 2 ? 'true' : 'false';
    return `value-${row + 1}`;
  }));
}
