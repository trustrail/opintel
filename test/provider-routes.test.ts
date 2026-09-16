import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyId, type CompanyId as CompanyIdType } from '../src/shared/kernel/index.js';
import { withPlatform } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import {
  ProviderResolutionService,
  type CompanyProviderSettings,
  type ProviderResolutionLogger,
  type ProviderResolutionRepository,
} from '../src/modules/identity/application/providers.js';
import { providerRoutes } from '../src/modules/identity/api/provider-routes.js';
import { PostgresProviderResolutionRepository } from '../src/modules/identity/infrastructure/provider-resolution-repository.js';

const companyId = CompanyId('018f8f9d-7f83-7abc-8def-000000000001');
const customProvider = { provider: 'oidc:acme', displayName: 'Acme SSO', startPath: '/auth/oidc/oidc:acme/start' };

class TestRepository implements ProviderResolutionRepository {
  readonly calls: string[] = [];
  constructor(private readonly companies: ReadonlyMap<string, CompanyProviderSettings>) {}
  async findCompanyForDomain(domain: string): Promise<CompanyProviderSettings | null> {
    this.calls.push(domain);
    return this.companies.get(domain) ?? null;
  }
}

class TestLogger implements ProviderResolutionLogger {
  readonly warnings: { message: string; companyId: CompanyIdType }[] = [];
  warn(message: string, fields: Readonly<{ companyId: CompanyIdType }>): void {
    this.warnings.push({ message, companyId: fields.companyId });
  }
}

function settings(ssoEnforced: boolean, providers: CompanyProviderSettings['providers']): CompanyProviderSettings {
  return { companyId, ssoEnforced, providers };
}

const servers: ReturnType<typeof createHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).filter((server) => server.listening).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

async function get(service: ProviderResolutionService, email: string): Promise<Response> {
  const server = createHttpServer(providerRoutes(service), { requestIdFactory: () => 'req-test' });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind to TCP.');
  return fetch(`http://127.0.0.1:${(address as AddressInfo).port}/api/v1/auth/providers?email=${encodeURIComponent(email)}`);
}

describe('GET /auth/providers', () => {
  it('A-002 and A-005: returns the same platform defaults for unknown domains and known companies without IdPs', async () => {
    const repository = new TestRepository(new Map([['known.example', settings(false, [])]]));
    const service = new ProviderResolutionService(repository);

    const unknown = await service.resolve('person@unknown.example');
    const known = await service.resolve('person@known.example');

    expect(unknown).toEqual({
      magicLink: true,
      providers: [
        { provider: 'oidc:google', displayName: 'Google', startPath: '/auth/oidc/oidc:google/start' },
        { provider: 'oidc:entra', displayName: 'Microsoft', startPath: '/auth/oidc/oidc:entra/start' },
      ],
      enforced: null,
    });
    expect(known).toEqual(unknown);
    expect(repository.calls).toEqual(['unknown.example', 'known.example']);
  });

  it('A-003: adds enabled company providers while retaining magic-link and platform-default routes', async () => {
    const service = new ProviderResolutionService(new TestRepository(new Map([['acme.example', settings(false, [customProvider])]])));

    await expect(service.resolve('person@acme.example')).resolves.toEqual({
      magicLink: true,
      providers: [
        { provider: 'oidc:google', displayName: 'Google', startPath: '/auth/oidc/oidc:google/start' },
        { provider: 'oidc:entra', displayName: 'Microsoft', startPath: '/auth/oidc/oidc:entra/start' },
        customProvider,
      ],
      enforced: null,
    });
  });

  it('A-004: returns only the uniquely enforced provider and disables magic links', async () => {
    const service = new ProviderResolutionService(new TestRepository(new Map([['acme.example', settings(true, [customProvider])]])));

    await expect(service.resolve('person@acme.example')).resolves.toEqual({
      magicLink: false,
      providers: [customProvider],
      enforced: 'oidc:acme',
    });
  });

  it('falls back safely and logs only the company identifier when enforced SSO has zero or multiple providers', async () => {
    const logger = new TestLogger();
    const service = new ProviderResolutionService(new TestRepository(new Map([
      ['zero.example', settings(true, [])],
      ['many.example', settings(true, [customProvider, { provider: 'oidc:other', displayName: 'Other SSO', startPath: '/auth/oidc/oidc:other/start' }])],
    ])), logger);

    const zero = await service.resolve('person@zero.example');
    const many = await service.resolve('person@many.example');

    expect(zero).toMatchObject({ magicLink: true, enforced: null });
    expect(many).toMatchObject({ magicLink: true, enforced: null });
    expect(logger.warnings).toEqual([
      { message: 'SSO enforcement is not applied because company provider configuration is ambiguous.', companyId },
      { message: 'SSO enforcement is not applied because company provider configuration is ambiguous.', companyId },
    ]);
  });

  it('A-010 through A-013: validates query email boundaries and normalizes Unicode domains without collapsing plus addresses', async () => {
    const repository = new TestRepository(new Map());
    const service = new ProviderResolutionService(repository);
    const valid320 = `${'a'.repeat(314)}@x.com`;
    const invalid321 = `${'a'.repeat(315)}@x.com`;

    await expect(get(service, 'not-an-email')).resolves.toMatchObject({ status: 400 });
    await expect(get(service, valid320)).resolves.toMatchObject({ status: 200 });
    await expect(get(service, invalid321)).resolves.toMatchObject({ status: 400 });
    await expect(get(service, 'δοκιμή+one@παράδειγμα.δοκιμή')).resolves.toMatchObject({ status: 200 });
    await expect(get(service, 'a+one@example.com')).resolves.toMatchObject({ status: 200 });
    await expect(get(service, 'a+two@example.com')).resolves.toMatchObject({ status: 200 });
    expect(repository.calls).toContain('xn--hxajbheg2az3al.xn--jxalpdlp');
    expect(repository.calls.filter((domain) => domain === 'example.com')).toHaveLength(2);
  });

  it('uses the error envelope for an invalid query and always supplies a request id', async () => {
    const response = await get(new ProviderResolutionService(new TestRepository(new Map())), 'invalid');

    expect(response.headers.get('x-request-id')).toBe('req-test');
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'validation_failed', requestId: 'req-test' },
    });
  });
});

const databaseTestsRequired = process.env.REQUIRE_DB_TESTS === '1';
const databaseIntegration = process.env.DATABASE_URL === undefined && !databaseTestsRequired ? describe.skip : describe;

databaseIntegration('provider resolution persistence', () => {
  it('reads enabled company providers for the matching allowed domain', async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required when REQUIRE_DB_TESTS=1.');
    const domain = `provider-${crypto.randomUUID()}.example`;
    const company = await withPlatform(async (tx) => {
      const industries = await tx.query<{ id: string }>('SELECT id FROM industry LIMIT 1');
      const industry = industries[0];
      if (industry === undefined) throw new Error('Seed industry is missing.');
      const companies = await tx.query<{ id: string }>(
        'INSERT INTO company (name, default_industry_id, default_region, allowed_domains) VALUES ($1, $2, $3, $4) RETURNING id',
        ['Provider route test', industry.id, 'us-east-1', [domain]],
      );
      const created = companies[0];
      if (created === undefined) throw new Error('Company creation failed.');
      await tx.query(
        `INSERT INTO company_idp (company_id, provider, display_name, issuer, client_id, client_secret_ref)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [created.id, 'oidc:acme', 'Acme SSO', 'https://idp.example', 'client', 'vault://opintel/idp/acme/client'],
      );
      return created.id;
    });
    try {
      await expect(new PostgresProviderResolutionRepository().findCompanyForDomain(domain)).resolves.toEqual({
        companyId: CompanyId(company),
        ssoEnforced: false,
        providers: [customProvider],
      });
    } finally {
      await withPlatform((tx) => tx.query('DELETE FROM company WHERE id = $1', [company]));
    }
  });
});
