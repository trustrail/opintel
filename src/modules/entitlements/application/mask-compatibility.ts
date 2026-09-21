import type { DuckDbType } from '../../catalog/index.js';
import { DomainError, err, ok, type Result } from '../../../shared/kernel/index.js';
import type { MaskKind } from '../domain/entitlement.js';
export function validateMaskType(kind: MaskKind, type: DuckDbType | null): Result<void> {
 const allowed = kind === 'all' || ((kind === 'last4' || kind === 'email') && type === 'VARCHAR') ||
  (kind === 'year' && (type === 'DATE' || type === 'TIMESTAMP' || type === 'TIMESTAMPTZ'));
 return allowed ? ok(undefined) : err(new DomainError('validation_failed',
  'This mask does not suit the element type. Use last4 or email for text, year for dates or timestamps, or all for any type.'));
}
