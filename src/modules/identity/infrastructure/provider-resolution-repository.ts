import { CompanyId } from '../../../shared/kernel/index.js';
import { withPlatform } from '../../../platform/db/scope.js';
import type { CompanyProviderSettings, ProviderOption, ProviderResolutionRepository } from '../application/providers.js';

type ProviderResolutionRow = {
  id: string;
  sso_enforced: boolean;
  provider: string | null;
  display_name: string | null;
};

function startPath(provider: string): string {
  return `/auth/oidc/${provider}/start`;
}

export class PostgresProviderResolutionRepository implements ProviderResolutionRepository {
  async findCompanyForDomain(domain: string): Promise<CompanyProviderSettings | null> {
    const rows = await withPlatform((tx) => tx.query<ProviderResolutionRow>(
      `SELECT company.id, company.sso_enforced, company_idp.provider, company_idp.display_name
       FROM company
       LEFT JOIN company_idp ON company_idp.company_id = company.id AND company_idp.enabled
       WHERE EXISTS (SELECT 1 FROM unnest(company.allowed_domains) AS allowed_domain WHERE lower(allowed_domain) = $1)
       ORDER BY company_idp.provider`,
      [domain],
    ));
    const company = rows[0];
    if (company === undefined) return null;
    return {
      companyId: CompanyId(company.id),
      ssoEnforced: company.sso_enforced,
      providers: rows.flatMap((provider): ProviderOption[] => provider.provider === null || provider.display_name === null ? [] : [{
        provider: provider.provider,
        displayName: provider.display_name,
        startPath: startPath(provider.provider),
      }]),
    };
  }
}
