import { z } from 'zod';
import type { ErrorCode } from './kernel/types.js';
const codes = {
  unauthenticated: true, forbidden: true, not_found: true, validation_failed: true,
  conflict: true, idempotency_key_reused: true, rate_limited: true, dependency_unavailable: true,
  entitlement_missing: true, element_withheld: true, object_unavailable: true, unsupported_on_token: true,
  term_unresolved: true, clarification_required: true, domain_knowledge_gap: true,
  sources_cannot_be_joined: true, large_result_confirmation: true, budget_exceeded: true,
  source_unavailable: true, sql_not_permitted: true, unsupported_pushdown: true,
} satisfies Record<ErrorCode, true>;
export const errorCodeSchema = z.custom<ErrorCode>((value) => typeof value === 'string' && Object.hasOwn(codes, value));
export const serviceErrorEnvelope = z.object({ error: z.object({
  code: errorCodeSchema, message: z.string(), retryable: z.boolean(), requestId: z.string(),
}) });
