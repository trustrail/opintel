import { z } from 'zod';
import { DomainError, err, ok, type Result, type ElementId } from '../../../shared/kernel/index.js';
import type { DuckDbType } from '../../catalog/index.js';
import type { EntitlementContext } from './entitlement-repository.js';
export interface CanonicaliserCatalog { canonicalisers(): Promise<Result<readonly string[]>>; }
export const canonicaliserAssignment = z.strictObject({ canonId: z.string().regex(/^[a-z0-9]+$(?![\s\S])/u), confirmation: z.string().optional() });
export function standardCanonId(type: DuckDbType | null, epochUnit: string | null): string {
  if (epochUnit !== null || type === 'TIMESTAMP' || type === 'TIMESTAMPTZ') return 'stdtime1';
  if (type === 'DATE') return 'stddate1';
  if (type && (['TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT','FLOAT','DOUBLE'].includes(type) || type.startsWith('DECIMAL('))) return 'stdnum1';
  return 'stdtext1';
}
export function validateCanonicaliserType(id: string, type: DuckDbType | null, epochUnit: string | null): Result<void> {
  const standard = standardCanonId(type, epochUnit);
  if (id === standard || (standard === 'stdtext1' && (type === 'VARCHAR' || type === 'UUID') && !['stdtext1','stdnum1','stddate1','stdtime1'].includes(id))) return ok(undefined);
  return err(new DomainError('validation_failed', 'The canonicaliser must match the element mode. Domain canonicalisers apply only to text.'));
}
export interface CanonicaliserAssignments {
  read(ctx: EntitlementContext, element: ElementId): Promise<Result<{canonId: string}>>;
  assign(ctx: EntitlementContext, element: ElementId, input: unknown): Promise<Result<{canonId: string}>>;
}
