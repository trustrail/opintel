import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultRef, type VaultPort } from '../src/platform/vault/index.js';
import type { OidcFlowState, OidcProviderConfiguration } from '../src/modules/identity/application/oidc.js';

const oidcMock = vi.hoisted(() => ({
  customFetch: Symbol('customFetch'),
  clockTolerance: Symbol('clockTolerance'),
}));

vi.mock('openid-client', () => ({
  customFetch: oidcMock.customFetch,
  clockTolerance: oidcMock.clockTolerance,
  discovery: async () => ({
    serverMetadata: () => ({ issuer: 'https://idp.example', token_endpoint: 'https://idp.example/token' }),
  }),
  enableNonRepudiationChecks: () => undefined,
  getJwksCache: () => undefined,
  setJwksCache: () => undefined,
  buildAuthorizationUrl: () => new URL('https://idp.example/authorize'),
  calculatePKCECodeChallenge: async () => 'challenge',
  authorizationCodeGrant: async (configuration: unknown) => {
    if (typeof configuration !== 'object' || configuration === null) throw new Error('OIDC configuration is invalid.');
    const handler = (configuration as Record<PropertyKey, unknown>)[oidcMock.customFetch];
    if (typeof handler !== 'function') throw new Error('OIDC custom fetch is unavailable.');
    const response: Response = await handler('https://idp.example/token', {});
    if (!response.ok) {
      const payload: unknown = await response.json();
      const code = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).error
        : undefined;
      throw new Error(typeof code === 'string' ? code : 'OIDC token rejected.');
    }
    return { claims: () => ({ sub: 'subject', email: 'person@example.com', email_verified: true }) };
  },
}));

import { OpenIdClientAdapter } from '../src/modules/identity/infrastructure/openid-client-adapter.js';

class TestVault implements VaultPort {
  async resolve(_ref: import('../src/platform/vault/index.js').VaultRef): Promise<string> { return 'secret'; }
  async store(_path: string, _secret: string): Promise<import('../src/platform/vault/index.js').VaultRef> { return VaultRef('vault://test/stored'); }
}

const configuration: OidcProviderConfiguration = {
  provider: 'google', issuer: 'https://idp.example', clientId: 'client',
  clientSecretRef: VaultRef('vault://opintel/idp/google/client'), discoveryUrl: null,
};

const flow: OidcFlowState = {
  codeVerifier: 'a'.repeat(43), nonce: 'nonce', provider: 'google', companyId: null,
  redirectUri: 'https://console.example/auth/callback', inviteId: null,
  deviceNonce: 'device-nonce', createdAt: '2026-01-01T00:00:00.000Z' as OidcFlowState['createdAt'],
};

function idTokenWith(algorithm: string): string {
  const header = Buffer.from(JSON.stringify({ alg: algorithm, typ: 'JWT' })).toString('base64url');
  return `${header}.payload.signature`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OIDC ID-token algorithms', () => {
  it.each(['none', 'HS256'])('refuses %s without disclosing the failed algorithm check', async (algorithm) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id_token: idTokenWith(algorithm) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    const adapter = new OpenIdClientAdapter(new TestVault());

    const rejection = adapter.exchange(
      configuration,
      'state',
      'https://console.example/auth/callback?code=code&state=state',
      flow,
    );

    await expect(rejection).rejects.toThrow('invalid_request');
    await expect(rejection).rejects.not.toThrow(algorithm);
  });
});
