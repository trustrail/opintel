import { z } from 'zod';
import { DomainError, err, ok, type Result, type ElementId } from '../../../shared/kernel/index.js';
import type { ExposedType } from '../domain/type-mapping.js';
import type { TemporalContext } from './temporal.js';

export const tokenDomain = z.string().regex(/^[a-z0-9]+$(?![\s\S])/u).refine(value => value !== 'sentinel');
export const tokenDeclarationPatch = z.strictObject({
  tokenDomain: tokenDomain.nullable().optional(), caseInsensitive: z.boolean().nullable().optional(), confirmation: z.string().optional(),
});
export type TokenDeclarations = { tokenDomain: string | null; caseInsensitive: boolean | null };
export interface TokenDeclarationRepository {
  read(ctx: TemporalContext, element: ElementId): Promise<Result<TokenDeclarations>>;
  setElement(ctx: TemporalContext, element: ElementId, input: unknown): Promise<Result<TokenDeclarations>>;
}
export function validateTokenDeclarations(type: ExposedType | null, value: TokenDeclarations, required = false): Result<void> {
  if ((required || value.tokenDomain !== null) && !tokenDomain.safeParse(value.tokenDomain).success) {
    return err(new DomainError('validation_failed', 'Declare tokenDomain using lowercase letters and digits before setting a tokenized entitlement; sentinel is reserved.'));
  }
  if (value.caseInsensitive !== null && type !== 'VARCHAR' && type !== 'UUID') {
    return err(new DomainError('validation_failed', 'caseInsensitive may only be declared on a text-mode column.'));
  }
  return ok(undefined);
}
