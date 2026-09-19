import { DomainError, err, ok, type Result } from '../../../shared/kernel/index.js';
import { dateValue } from './extraction.js';

export type LandingStrategy = 'append_as_at' | 'table_per_filing';
export type PeriodAsAtFormat = 'month_end' | 'month_start' | 'quarter_end' | 'exact_date';
export function periodAsAt(period: string, format: PeriodAsAtFormat | null): Result<string | null> {
  if (format === null) return ok(null);
  if (format === 'exact_date') {
    const date = dateValue(period, 'YYYY-MM-DD');
    if (date) return ok(date);
  } else {
    const match = (format === 'quarter_end' ? /^(\d{4})-Q([1-4])$/ : /^(\d{4})-(0[1-9]|1[0-2])$/).exec(period);
    if (match && Number(match[1]) > 0) {
      const year = Number(match[1]); const month = Number(match[2]) * (format === 'quarter_end' ? 3 : 1);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const day = format === 'month_start' ? 1 : [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
      return ok(`${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }
  return err(new DomainError('validation_failed', `Period ${JSON.stringify(period)} does not parse as ${format}.`));
}
