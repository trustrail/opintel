export { Entitlement, treatments, maskKinds, type MaskKind, type Treatment, type EntitlementState } from './domain/entitlement.js';
export type { EntitlementRepository, EntitlementContext } from './application/entitlement-repository.js';
export { PostgresEntitlements } from './infrastructure/postgres-entitlements.js';
export { TreatmentStrategies, type TreatmentStrategy } from './application/treatments.js';
export type { TokenizerPort } from './application/tokenizer-port.js';

export { KeyCustodyService, type CustodyContext, type CustodyPort } from './application/key-custody.js';
export { PostgresCustodyRepository } from './infrastructure/key-custody-repository.js';
export { SidecarCustodyClient } from './infrastructure/custody-client.js';

export { PostgresCanonicaliserAssignments } from './infrastructure/canonicalisers.js';
export type { CanonicaliserCatalog, CanonicaliserAssignments } from './application/canonicalisers.js';
