import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  clockTolerance,
  customFetch,
  discovery,
  enableNonRepudiationChecks,
  getJwksCache,
  setJwksCache,
  type Configuration,
  type ExportedJWKSCache,
} from 'openid-client';
import { type SecretStorePort } from '../../../platform/secrets/index.js';
import type { OidcFlowState, OidcProviderConfiguration, OidcProviderPort, VerifiedOidcIdentity } from '../application/oidc.js';

const acceptedAlgorithms = new Set(['RS256', 'ES256']);

function tokenAlgorithm(token: string): string | null {
  const encodedHeader = token.split('.')[0];
  if (encodedHeader === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return null;
    const algorithm = (decoded as Record<string, unknown>).alg;
    return typeof algorithm === 'string' ? algorithm : null;
  } catch {
    return null;
  }
}

function idTokenResponse(response: Response): Promise<Response> {
  if (!response.ok) return Promise.resolve(response);
  return response.clone().json().then((payload: unknown) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return response;
    const token = (payload as Record<string, unknown>).id_token;
    if (typeof token !== 'string' || !acceptedAlgorithms.has(tokenAlgorithm(token) ?? '')) {
      return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return response;
  }).catch(() => response);
}

function sameRedirectUri(callbackUrl: string, redirectUri: string): boolean {
  try {
    const callback = new URL(callbackUrl);
    const registered = new URL(redirectUri);
    return callback.origin === registered.origin && callback.pathname === registered.pathname;
  } catch {
    return false;
  }
}

function identityFromClaims(claims: Record<string, unknown>): VerifiedOidcIdentity {
  const subject = claims.sub;
  const email = claims.email;
  if (typeof subject !== 'string' || typeof email !== 'string') throw new Error('OIDC ID token lacks a usable subject or email.');
  return { subject, email, emailVerified: claims.email_verified === true };
}

export class OpenIdClientAdapter implements OidcProviderPort {
  private readonly jwksCaches = new Map<string, ExportedJWKSCache>();

  constructor(private readonly secrets: SecretStorePort) {}

  async authorizationUrl(configuration: OidcProviderConfiguration, state: string, flow: OidcFlowState): Promise<string> {
    const client = await this.client(configuration);
    const challenge = await import('openid-client').then(({ calculatePKCECodeChallenge }) => calculatePKCECodeChallenge(flow.codeVerifier));
    return buildAuthorizationUrl(client, {
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: flow.redirectUri,
      state,
      nonce: flow.nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
  }

  async exchange(configuration: OidcProviderConfiguration, state: string, callbackUrl: string, flow: OidcFlowState): Promise<VerifiedOidcIdentity> {
    if (!sameRedirectUri(callbackUrl, flow.redirectUri)) throw new Error('OIDC callback did not use the registered redirect URI.');
    const client = await this.client(configuration);
    const token = await authorizationCodeGrant(client, new URL(callbackUrl), {
      expectedState: state,
      expectedNonce: flow.nonce,
      pkceCodeVerifier: flow.codeVerifier,
    });
    const claims = token.claims();
    if (claims === undefined) throw new Error('OIDC token endpoint did not return an ID token.');
    const cache = getJwksCache(client);
    if (cache !== undefined) this.jwksCaches.set(`${configuration.issuer}:${configuration.clientId}`, cache);
    return identityFromClaims(claims as Record<string, unknown>);
  }

  private async client(configuration: OidcProviderConfiguration): Promise<Configuration> {
    const secret = await this.secrets.resolve(configuration.clientSecretRef);
    const discoveryTarget = new URL(configuration.discoveryUrl ?? configuration.issuer);
    const client = await discovery(discoveryTarget, configuration.clientId, {
      client_secret: secret,
      [clockTolerance]: 60,
    });
    if (client.serverMetadata().issuer !== configuration.issuer) throw new Error('OIDC discovery issuer did not match configuration.');
    enableNonRepudiationChecks(client);
    const cacheKey = `${configuration.issuer}:${configuration.clientId}`;
    const cached = this.jwksCaches.get(cacheKey);
    if (cached !== undefined) setJwksCache(client, cached);
    const tokenEndpoint = client.serverMetadata().token_endpoint;
    client[customFetch] = async (input, init) => {
      const response = await fetch(input, init as unknown as Parameters<typeof fetch>[1]);
      if (tokenEndpoint === undefined || String(input) !== tokenEndpoint) return response;
      return idTokenResponse(response);
    };
    return client;
  }
}
