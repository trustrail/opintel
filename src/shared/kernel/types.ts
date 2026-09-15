import type { UserId, RuleId } from './value-objects.js';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ErrorCode =
  | 'unauthenticated' | 'forbidden' | 'not_found' | 'validation_failed'
  | 'conflict' | 'idempotency_key_reused' | 'rate_limited' | 'dependency_unavailable'
  | 'entitlement_missing' | 'element_withheld' | 'object_unavailable'
  | 'term_unresolved' | 'clarification_required' | 'domain_knowledge_gap'
  | 'sources_cannot_be_joined' | 'large_result_confirmation' | 'budget_exceeded'
  | 'source_unavailable' | 'sql_not_permitted' | 'unsupported_pushdown';

export type ActorRef =
  | { kind: 'user';   id: UserId }
  | { kind: 'rule';   id: RuleId }
  | { kind: 'system'; name: string };
