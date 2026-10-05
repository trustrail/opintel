import { z } from 'zod';
import { declaredTokenDomain } from '../../../shared/token-domain.js';
import { DomainError, err, ok, type Result, type ElementId } from '../../../shared/kernel/index.js';
import type { ExposedType } from '../domain/type-mapping.js';
import type { TemporalContext } from './temporal.js';

export const tokenDomain = declaredTokenDomain;
export const tokenDeclarationPatch = z.strictObject({
  tokenDomain: tokenDomain.nullable().optional(), caseInsensitive: z.boolean().nullable().optional(), confirmation: z.string().optional(),
});
export type TokenDeclarations = { tokenDomain: string | null; caseInsensitive: boolean | null };
export interface TokenDeclarationRepository {
  read(ctx: TemporalContext, element: ElementId): Promise<Result<TokenDeclarations>>;
  setElement(ctx: TemporalContext, element: ElementId, input: unknown): Promise<Result<TokenDeclarations>>;
}
export function validateTokenDeclarations(type: ExposedType | null, value: TokenDeclarations): Result<void> {
  if (value.tokenDomain !== null && !tokenDomain.safeParse(value.tokenDomain).success) {
    return err(new DomainError('validation_failed', 'Declare tokenDomain using lowercase letters and digits; sentinel and opintelisolated domains are reserved.',{fields:['tokenDomain']}));
  }
  if (value.caseInsensitive !== null && type !== 'VARCHAR' && type !== 'UUID') {
    return err(new DomainError('validation_failed', 'caseInsensitive may only be declared on a text-mode column.',{fields:['caseInsensitive']}));
  }
  return ok(undefined);
}
