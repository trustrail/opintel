import type { SecretStorePort } from '../src/platform/secrets/index.js';
import type { SamplingAuditPort, SidecarConnector } from './application/source-connector.js';
import { PostgresConnector } from './infrastructure/postgres-connector.js';
import { PostgresSourceScope, type SourceLimits } from './infrastructure/postgres-source-scope.js';

/** Compose once per sidecar host. Development supplies EnvironmentSecretStore;
 * production supplies its secret manager through the same port. No resolution
 * happens here: each source operation resolves its reference inside its scope. */
export function createPostgresConnector(options: {
  secrets: SecretStorePort;
  audit: SamplingAuditPort;
  limits: SourceLimits;
}): SidecarConnector {
  return new PostgresConnector(new PostgresSourceScope(options.secrets, options.limits), options.audit);
}
