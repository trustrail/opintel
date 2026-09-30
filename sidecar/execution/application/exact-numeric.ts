import { DomainError, err, ok, type Result } from '../../../src/shared/kernel/index.js';

/** Source numeric text only: never parse through a JS number or a rounded cast. */
export function exactDefaultNumeric(value: unknown, column: string, shape: 'scalar' | 'array'): Result<void> {
  const check = (input: unknown): Result<void> => {
    if (input === null) return ok(undefined);
    const match = typeof input === 'string' ? /^[+-]?(\d+)(?:\.(\d+))?$/u.exec(input) : null;
    const integerDigits = match ? match[1]!.replace(/^0+/u,'').length : null;
    const fractionalDigits = match ? (match[2] ?? '').replace(/0+$/u,'').length : null;
    if (integerDigits !== null && fractionalDigits !== null && integerDigits <= 29 && fractionalDigits <= 9) return ok(undefined);
    const magnitude = integerDigits === null ? 'non-finite or unusable numeric'
      : `${integerDigits} integer digits and ${fractionalDigits} fractional digits`;
    return err(new DomainError('validation_failed',
      `Column ${column} contains a numeric with magnitude ${magnitude}, which cannot be represented exactly as DECIMAL(38,9). No result was returned. Declare sufficient precision and scale on the source column.`,
      {cause:'numeric_not_representable',name:column,magnitude},false));
  };
  if (shape === 'scalar' || value === null) return check(value);
  let array: unknown;
  try { array = typeof value === 'string' ? JSON.parse(value) as unknown : value; }
  catch { return check(undefined); }
  const visit = (v: unknown): Result<void> => {
    if (!Array.isArray(v)) return check(v);
    for (const entry of v) { const checked=visit(entry); if(!checked.ok)return checked; }
    return ok(undefined);
  };
  return Array.isArray(array) ? visit(array) : check(undefined);
}
