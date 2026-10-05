import { z } from 'zod';
import { type Result, type ElementId } from '../../../shared/kernel/index.js';
import type { EntitlementContext } from './entitlement-repository.js';
export interface CanonicaliserCatalog { canonicalisers(ctx?:EntitlementContext,element?:ElementId): Promise<Result<readonly string[]>>; }
export const canonicaliserAssignment = z.strictObject({ canonId: z.string().regex(/^[a-z0-9]+$(?![\s\S])/u), confirmation: z.string().optional() });
export { standardCanonId, validateCanonicaliserType } from '../../catalog/index.js';
export interface CanonicaliserAssignments {
  read(ctx: EntitlementContext, element: ElementId): Promise<Result<{canonId: string}>>;
  assign(ctx: EntitlementContext, element: ElementId, input: unknown): Promise<Result<{canonId: string}>>;
}
