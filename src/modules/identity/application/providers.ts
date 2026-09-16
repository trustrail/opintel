import { domainToASCII } from 'node:url';
import type { CompanyId } from '../../../shared/kernel/index.js';

export type ProviderOption = {
  provider: string;
  displayName: string;
  startPath: string;
};

export type ProvidersResponse = {
  magicLink: boolean;
  providers: ProviderOption[];
  enforced: string | null;
};

export type CompanyProviderSettings = {
  companyId: CompanyId;
  ssoEnforced: boolean;
  providers: ProviderOption[];
};

export interface ProviderResolutionRepository {
  findCompanyForDomain(domain: string): Promise<CompanyProviderSettings | null>;
}

export interface ProviderResolutionLogger {
  warn(message: string, fields: Readonly<{ companyId: CompanyId }>): void;
}

const platformDefaults: readonly ProviderOption[] = [
  { provider: 'oidc:google', displayName: 'Google', startPath: '/auth/oidc/oidc:google/start' },
  { provider: 'oidc:entra', displayName: 'Microsoft', startPath: '/auth/oidc/oidc:entra/start' },
];

const defaultLogger: ProviderResolutionLogger = {
  warn(message, fields): void {
    console.warn(message, fields);
  },
};

export function domainForProviderLookup(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at !== email.indexOf('@') || at === email.length - 1) throw new Error('Email is malformed.');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (/\s/u.test(local) || [...local].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new Error('Email is malformed.');
  }
  const asciiDomain = domainToASCII(domain);
  if (asciiDomain.length === 0 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(asciiDomain)) throw new Error('Email is malformed.');
  return asciiDomain.toLowerCase();
}

export function isProviderLookupEmail(email: string): boolean {
  try {
    domainForProviderLookup(email);
    return email.length <= 320;
  } catch {
    return false;
  }
}

export class ProviderResolutionService {
  constructor(
    private readonly repository: ProviderResolutionRepository,
    private readonly logger: ProviderResolutionLogger = defaultLogger,
  ) {}

  async resolve(email: string): Promise<ProvidersResponse> {
    const company = await this.repository.findCompanyForDomain(domainForProviderLookup(email));
    if (company === null) return { magicLink: true, providers: [...platformDefaults], enforced: null };

    const providers = [...platformDefaults, ...company.providers];
    if (!company.ssoEnforced) return { magicLink: true, providers, enforced: null };
    const enabled = company.providers;
    if (enabled.length !== 1) {
      this.logger.warn('SSO enforcement is not applied because company provider configuration is ambiguous.', { companyId: company.companyId });
      return { magicLink: true, providers, enforced: null };
    }
    const enforcedProvider = enabled[0];
    if (enforcedProvider === undefined) throw new Error('Enabled provider count was unexpectedly empty.');
    return { magicLink: false, providers: [enforcedProvider], enforced: enforcedProvider.provider };
  }
}

export { platformDefaults };
