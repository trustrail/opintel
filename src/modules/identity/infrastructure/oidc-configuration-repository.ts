import { withPlatform } from '../../../platform/db/scope.js';
import { SecretRef } from '../../../platform/secrets/index.js';
import type { OidcConfigurationRepository, OidcProviderConfiguration } from '../application/oidc.js';

type IdpRow = {
  provider: string;
  issuer: string;
  client_id: string;
  client_secret_ref: string;
  discovery_url: string | null;
};

export class PostgresOidcConfigurationRepository implements OidcConfigurationRepository {
  async find(provider: string, companyId: import('../../../shared/kernel/index.js').CompanyId | null): Promise<OidcProviderConfiguration | null> {
    if (companyId === null) return null;
    const rows = await withPlatform((tx) => tx.query<IdpRow>(
      `SELECT provider, issuer, client_id, client_secret_ref, discovery_url
       FROM company_idp WHERE company_id = $1 AND provider = $2 AND enabled`,
      [companyId, provider],
    ));
    const row = rows[0];
    if (row === undefined) return null;
    return {
      provider: row.provider,
      issuer: row.issuer,
      clientId: row.client_id,
      clientSecretRef: SecretRef(row.client_secret_ref),
      discoveryUrl: row.discovery_url,
    };
  }
}
