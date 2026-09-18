import type { VaultPort } from '../src/platform/vault/index.js';
import type { SamplingAuditPort, SidecarConnector } from './application/source-connector.js';
import { PostgresConnector } from './infrastructure/postgres-connector.js';
import { PostgresSourceScope, type SourceLimits } from './infrastructure/postgres-source-scope.js';

/** Compose once per sidecar host. Development supplies DevelopmentVaultAdapter;
 * production supplies its secret manager through the same port. No resolution
 * happens here: each source operation resolves its reference inside its scope. */
export function createPostgresConnector(options: {
  vault: VaultPort;
  audit: SamplingAuditPort;
  limits: SourceLimits;
}): SidecarConnector {
  return new PostgresConnector(new PostgresSourceScope(options.vault, options.limits), options.audit);
}
