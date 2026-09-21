import { DomainError } from '../../../shared/kernel/errors.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type { PoolId, ProjectId, SourceId, UserId, PoolName, Timestamp } from '../../../shared/kernel/index.js';
export type PoolKeyId = string & { readonly __brand: 'PoolKeyId' };
export type KeyHash = string & { readonly __brand: 'KeyHash' };
export function poolKeyId(value: string): Result<PoolKeyId> {
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ? ok(value as PoolKeyId) : err(new DomainError('validation_failed','Invalid pool key identifier.'));
}
/** Encoded SHA-256 digest, never a credential. Hashing belongs to item 5.2. */
export function keyHash(value: string): Result<KeyHash> {
 return /^[0-9a-f]{64}$/u.test(value) ? ok(value as KeyHash) : err(new DomainError('validation_failed','A pool key requires a SHA-256 digest.'));
}
export type PoolBudgets = Readonly<{ rowsPerDay: number; rowsPerRequest: number; timeoutMs: number; memoryMb: number; concurrency: number }>;
export type KeyRecord = Readonly<{
 id: PoolKeyId; poolId: PoolId; projectId: ProjectId; hash: KeyHash; prefix: string;
 state: 'current' | 'retiring' | 'revoked' | 'expired'; graceUntil: Timestamp | null;
 createdAt: Timestamp; createdBy: UserId;
}>;
export type PoolState = Readonly<{
 id: PoolId; projectId: ProjectId; name: PoolName; boundSources: readonly SourceId[];
 modes: Readonly<{ query: boolean; prompt: boolean }>; clarificationPolicy: 'pause' | 'refuse';
 budgets: PoolBudgets; keys: readonly KeyRecord[];
}>;
export class Pool {
 private constructor(readonly state: PoolState) {}
 static create(state: PoolState): Result<Pool> {
  const invalid = (message: string) => err(new DomainError('validation_failed',message));
  if (state.name.trim().length < 1 || state.name.length > 80) return invalid('A pool name must contain 1 to 80 characters.');
  if (new Set(state.boundSources).size !== state.boundSources.length) return invalid('A source can be bound to a pool only once.');
  if (state.keys.filter(key => key.state === 'current').length > 1 || state.keys.filter(key => key.state === 'retiring').length > 1) return invalid('A pool permits one current key and one retiring key.');
  if (new Set(state.keys.map(key => key.id)).size !== state.keys.length || new Set(state.keys.map(key => key.hash)).size !== state.keys.length) return invalid('Pool keys must have distinct identities and hashes.');
  for (const key of state.keys) {
   if (key.poolId !== state.id || key.projectId !== state.projectId) return invalid('A key must belong to its pool and project.');
   if (!keyHash(key.hash).ok || !/^opk_live_[A-Za-z0-9]{1,21}$/u.test(key.prefix)) return invalid('Store a key digest and a partial display prefix, never the credential.');
   const timed = key.state === 'retiring' || key.state === 'expired';
   if (timed ? key.graceUntil === null || Date.parse(key.graceUntil) <= Date.parse(key.createdAt) : key.graceUntil !== null) return invalid('A retiring or expired key requires a grace expiry after creation; other states have none.');
  }
  // Copy only aggregate fields: a caller's surplus credential or presence data
  // must never become part of the durable pool snapshot.
  return ok(new Pool(Object.freeze({
   id: state.id, projectId: state.projectId, name: state.name,
   boundSources: Object.freeze([...state.boundSources]),
   modes: Object.freeze({query:state.modes.query,prompt:state.modes.prompt}),
   clarificationPolicy: state.clarificationPolicy,
   budgets: Object.freeze({rowsPerDay:state.budgets.rowsPerDay,rowsPerRequest:state.budgets.rowsPerRequest,timeoutMs:state.budgets.timeoutMs,memoryMb:state.budgets.memoryMb,concurrency:state.budgets.concurrency}),
   keys: Object.freeze(state.keys.map(key => Object.freeze({
    id:key.id,poolId:key.poolId,projectId:key.projectId,hash:key.hash,prefix:key.prefix,
    state:key.state,graceUntil:key.graceUntil,createdAt:key.createdAt,createdBy:key.createdBy,
   }))),
  })));
 }
 /** Pure lifecycle predicate. Credential verification and authorization are not performed here. */
 keyIsUsable(id: PoolKeyId, at: Timestamp): boolean {
  const key = this.state.keys.find(candidate => candidate.id === id);
  return key !== undefined && Date.parse(at) >= Date.parse(key.createdAt) && (key.state === 'current' || key.state === 'retiring' && key.graceUntil !== null && Date.parse(at) < Date.parse(key.graceUntil));
 }
}
