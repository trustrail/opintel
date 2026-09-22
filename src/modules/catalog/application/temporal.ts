import { z } from 'zod';
import { DomainError, err, ok, type Result, type ElementId, type ProjectId, type SourceId, type UserId } from '../../../shared/kernel/index.js';
import type { DuckDbType } from '../domain/type-mapping.js';

export const sourceTimezone = z.string().refine(value => {
  // Reject offset strings: declarations name an IANA zone, never a host default.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/u.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'sourceTimezone must name a valid IANA timezone.');
export const epochUnit = z.enum(['seconds', 'milliseconds']);
export const temporalPatch = z.strictObject({
  sourceTimezone: sourceTimezone.nullable().optional(),
  epochUnit: epochUnit.nullable().optional(),
  confirmation: z.string().optional(),
});
export const schemaTimezonePatch = z.strictObject({ sourceTimezone: sourceTimezone.nullable(), confirmation: z.string().optional() });
export type TemporalContext = { projectId: ProjectId; userId: UserId };
export type TemporalDeclarations = { sourceTimezone: string | null; epochUnit: z.infer<typeof epochUnit> | null };
export type TemporalView = TemporalDeclarations & { schemaTimezone: string | null; effectiveSourceTimezone: string | null };
export interface TemporalRepository {
  read(ctx: TemporalContext, element: ElementId): Promise<Result<TemporalView>>;
  setElement(ctx: TemporalContext, element: ElementId, input: unknown): Promise<Result<TemporalView>>;
  setSchema(ctx: TemporalContext, source: SourceId, schema: string, input: unknown): Promise<Result<void>>;
}
export function validateTemporalType(type: DuckDbType | null, declarations: TemporalDeclarations): Result<void> {
  if (declarations.epochUnit !== null && (type === null || !['TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT'].includes(type))) {
    return err(new DomainError('validation_failed', 'epochUnit may only be declared on an integer column.'));
  }
  return ok(undefined);
}
export function validateTokenizedTemporal(type: DuckDbType | null, declarations: TemporalDeclarations): Result<void> {
  const valid = validateTemporalType(type, declarations);
  if (!valid.ok) return valid;
  if (type === 'TIMESTAMP' && declarations.sourceTimezone === null) {
    return err(new DomainError('validation_failed', 'Declare sourceTimezone on this element or its schema before setting a tokenized entitlement on a timestamp without a zone.'));
  }
  return ok(undefined);
}
