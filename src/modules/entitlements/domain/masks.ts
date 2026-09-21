import { ok, type Result } from '../../../shared/kernel/index.js';
import type { MaskKind } from './entitlement.js';
const fullyMasked = '****';
/** Values are transient: neither failures nor metadata carry the input. */
export function maskValue(kind: MaskKind, value: unknown): Result<string | null> {
 if (value === null) return ok(null);
 switch (kind) {
  case 'all': return ok(fullyMasked);
  case 'last4': {
   if (typeof value !== 'string') return ok(fullyMasked);
   const chars = Array.from(value);
   return ok(chars.length <= 4 ? fullyMasked : '••••' + chars.slice(-4).join(''));
  }
  case 'email': {
   if (typeof value !== 'string' || !/^[^@\s]+@[^@\s]+$/u.test(value)) return ok(fullyMasked);
   return ok('•••' + value.slice(value.indexOf('@')));
  }
  case 'year': {
   // Database date/timestamp values are valid. Defensively mask malformed adapter
   // input; never infer a locale or parse a date in the machine's timezone.
   if (value instanceof Date) return ok(Number.isFinite(value.getTime()) ? String(value.getUTCFullYear()) : fullyMasked);
   if (typeof value !== 'string') return ok(fullyMasked);
   const date = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)?)?$/u.exec(value);
   if (!date) return ok(fullyMasked);
   const year=Number(date[1]), month=Number(date[2]), day=Number(date[3]);
   const leap=year%4===0&&(year%100!==0||year%400===0);
   const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
   return ok(days!==undefined&&day>=1&&day<=days ? date[1]! : fullyMasked);
  }
 }
}
