export type { SidecarConnector, SourceCredentialResolver, SamplingAudit, SamplingAuditPort } from './application/source-connector.js';
export { PostgresConnector } from './infrastructure/postgres-connector.js';
export { PostgresSourceScope, type SourceLimits } from './infrastructure/postgres-source-scope.js';
export { createPostgresConnector } from './create-postgres-connector.js';
