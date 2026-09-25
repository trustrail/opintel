import type { SessionMeta, SessionPort, SessionRecord, SessionSummary } from '../src/modules/identity/application/session.js';
import { describe, expect, it } from 'vitest';
import {
  InviteId,
  SessionId,
  TestClock,
  Timestamp,
  UserId,
  type InviteId as InviteIdType,
  type Timestamp as TimestampType,
  type UserId as UserIdType,
} from '../src/shared/kernel/index.js';
import { SecretRef } from '../src/platform/secrets/index.js';
import {
  OidcService,
  type OidcConfigurationRepository,
  type OidcFlowState,
  type OidcFlowStore,
  type OidcProviderConfiguration,
  type OidcProviderPort,
  type VerifiedOidcIdentity,
} from '../src/modules/identity/application/oidc.js';
import { MagicLinkService, type AccountRepository, type InviteRepository, type MagicLinkRepository, type MagicLinkToken, type PendingInvite, type RateLimiter, type UserAccount } from '../src/modules/identity/application/magic-link.js';

function userId(number: number): UserIdType {
  return UserId(`018f8f9d-7f83-7abc-8def-${String(number).padStart(12, '0')}`);
}

function sessionId(number: number): import('../src/shared/kernel/index.js').SessionId {
  return SessionId(`018f8f9d-7f83-7abc-8def-${String(number).padStart(12, '0')}`);
}

class MemoryAccounts implements AccountRepository {
  readonly accounts = new Map<string, UserAccount>();
  readonly identities = new Map<string, UserIdType>();
  private nextId = 1;

  async findByEmail(email: string): Promise<UserAccount | null> { return this.accounts.get(email) ?? null; }
  async create(email: string, _invite: PendingInvite | null): Promise<UserAccount> {
    const account = { id: userId(this.nextId), email };
    this.nextId += 1;
    this.accounts.set(email, account);
    return account;
  }
  async linkVerifiedIdentity(accountId: UserIdType, provider: string, subject: string): Promise<void> {
    const key = `${provider}:${subject}`;
    const existing = this.identities.get(key);
    if (existing !== undefined && existing !== accountId) throw new Error('identity already linked');
    this.identities.set(key, accountId);
  }
  async recordLogin(_id: UserIdType, _at: TimestampType): Promise<void> {}
}

class MemoryInvites implements InviteRepository {
  readonly accepted: InviteIdType[] = [];
  constructor(private readonly invitations = new Map<string, PendingInvite>()) {}
  async findPendingFor(email: string): Promise<PendingInvite | null> { return this.invitations.get(email) ?? null; }
  async findInvitationById(id: InviteIdType): Promise<PendingInvite | null> { return [...this.invitations.values()].find((invite) => invite.id === id) ?? null; }
  async markAccepted(id: InviteIdType, _by: UserIdType): Promise<void> { this.accepted.push(id); }
}

class MemoryFlows implements OidcFlowStore {
  readonly flows = new Map<string, OidcFlowState>();
  async save(state: string, flow: OidcFlowState): Promise<void> { this.flows.set(state, flow); }
  async consume(state: string): Promise<OidcFlowState | null> {
    const flow = this.flows.get(state) ?? null;
    this.flows.delete(state);
    return flow;
  }
}

class MemoryMagicTokens implements MagicLinkRepository {
  async expiredInvitation(): Promise<boolean> { return false; }
  private readonly tokens = new Map<string, MagicLinkToken>();
  async issue(email: string, tokenHash: Buffer, deviceNonce: string, inviteId: InviteIdType | null, _expiresAt: TimestampType, _ip: string | null): Promise<void> {
    this.tokens.set(tokenHash.toString('hex'), { id: tokenHash.toString('hex'), email, deviceNonce, inviteId });
  }
  async issueAndEnqueue(email: string, tokenHash: Buffer, deviceNonce: string, inviteId: InviteIdType | null, expiresAt: TimestampType, ip: string | null): Promise<MagicLinkToken> {
    await this.issue(email, tokenHash, deviceNonce, inviteId, expiresAt, ip);
    const token = this.tokens.get(tokenHash.toString('hex'));
    if (token === undefined) throw new Error('Magic token was not stored.');
    return token;
  }
  async invalidateOutstanding(_email: string): Promise<number> { return 0; }
  async consume(tokenHash: Buffer, deviceNonce: string, _now: TimestampType): Promise<MagicLinkToken | null> {
    const key = tokenHash.toString('hex');
    const token = this.tokens.get(key);
    if (token === undefined || token.deviceNonce !== deviceNonce) return null;
    this.tokens.delete(key);
    return token;
  }
  async consumeConfirmed(tokenHash: Buffer, _now: TimestampType): Promise<MagicLinkToken | null> {
    const key = tokenHash.toString('hex');
    const token = this.tokens.get(key) ?? null;
    this.tokens.delete(key);
    return token;
  }
  async peek(tokenHash: Buffer, _now: TimestampType): Promise<MagicLinkToken | null> { return this.tokens.get(tokenHash.toString('hex')) ?? null; }
}

class AllowAllRateLimiter implements RateLimiter {
  async check(_key: string, _limit: number, _windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

class TestProvider implements OidcProviderPort {
  identity: VerifiedOidcIdentity = { subject: 'subject-1', email: 'person@example.com', emailVerified: true };
  refuse = false;
  async authorizationUrl(_configuration: OidcProviderConfiguration, state: string, flow: OidcFlowState): Promise<string> {
    return `https://idp.example/authorize?state=${state}&nonce=${flow.nonce}`;
  }
  async exchange(_configuration: OidcProviderConfiguration, state: string, callbackUrl: string, flow: OidcFlowState): Promise<VerifiedOidcIdentity> {
    if (this.refuse || new URL(callbackUrl).searchParams.get('state') !== state || new URL(callbackUrl).searchParams.get('nonce') === 'wrong') throw new Error('invalid provider callback');
    return this.identity;
  }
}

class TestConfigurations implements OidcConfigurationRepository {
  readonly configuration: OidcProviderConfiguration = {
    provider: 'google', issuer: 'https://idp.example', clientId: 'client',
    clientSecretRef: SecretRef('secret://opintel/idp/google/client'), discoveryUrl: null,
  };
  async find(provider: string): Promise<OidcProviderConfiguration | null> { return provider === 'google' || provider === 'entra' ? { ...this.configuration, provider } : null; }
}

class MemorySessions implements SessionPort {
  readonly created: { user: UserIdType; method: string; meta: SessionMeta }[] = [];
  async create(user: UserIdType, meta: SessionMeta, method: `oidc:${string}` | 'magic_link', _confirmed: boolean): Promise<import('../src/shared/kernel/index.js').SessionId> {
    this.created.push({ user, method, meta });
    return sessionId(this.created.length);
  }
  async read(_id: import('../src/shared/kernel/index.js').SessionId): Promise<SessionRecord | null> { return null; }
  async touch(_id: import('../src/shared/kernel/index.js').SessionId): Promise<void> {}
  async rotate(id: import('../src/shared/kernel/index.js').SessionId): Promise<import('../src/shared/kernel/index.js').SessionId> { return id; }
  async revoke(_id: import('../src/shared/kernel/index.js').SessionId): Promise<void> {}
  async revokeAllFor(_user: UserIdType, _except?: import('../src/shared/kernel/index.js').SessionId): Promise<number> { return 0; }
  async listFor(_user: UserIdType): Promise<SessionSummary[]> { return []; }
}

function setup(invite: PendingInvite | null = null): { service: OidcService; accounts: MemoryAccounts; invites: MemoryInvites; flows: MemoryFlows; provider: TestProvider; sessions: MemorySessions } {
  const accounts = new MemoryAccounts();
  const invites = new MemoryInvites(invite === null ? new Map() : new Map([[invite.email, invite]]));
  const flows = new MemoryFlows();
  const provider = new TestProvider();
  const sessions = new MemorySessions();
  return {
    service: new OidcService(new TestConfigurations(), flows, provider, accounts, invites, sessions, new TestClock()),
    accounts, invites, flows, provider, sessions,
  };
}

describe('OIDC identity', () => {
  it('C-001: completes a PKCE round trip and records the provider session method', async () => {
    const { service, flows, sessions, accounts } = setup();
    await accounts.create('person@example.com', null);
    await expect(service.begin({ provider: 'google', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' })).resolves.toMatchObject({ authorizationUrl: expect.stringContaining('https://idp.example/authorize') });
    const [state, flow] = [...flows.flows.entries()][0] ?? [];
    if (state === undefined || flow === undefined) throw new Error('OIDC flow was not saved.');
    expect(flow.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    await expect(service.callback(state, `https://console.example/auth/callback?code=code&state=${state}`, { ip: '192.0.2.1', userAgent: 'test' })).resolves.toMatchObject({ kind: 'session' });
    expect(sessions.created).toMatchObject([{ method: 'oidc:google', meta: { deviceNonce: 'device-nonce' } }]);
  });

  it('C-002, C-003 and C-004: refuses an absent state, a nonce mismatch, and a replay without disclosing which', async () => {
    const { service, flows, provider } = setup();
    const refused = { kind: 'refused', message: 'This sign-in request is no longer valid.' };
    await expect(service.callback('missing', 'https://console.example/auth/callback?state=missing', { ip: '192.0.2.1', userAgent: 'test' })).resolves.toEqual(refused);
    await service.begin({ provider: 'google', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const state = [...flows.flows.keys()][0];
    if (state === undefined) throw new Error('OIDC flow was not saved.');
    await expect(service.callback(state, `https://console.example/auth/callback?state=${state}&nonce=wrong`, { ip: '192.0.2.1', userAgent: 'test' })).resolves.toEqual(refused);
    provider.refuse = false;
    await expect(service.callback(state, `https://console.example/auth/callback?state=${state}`, { ip: '192.0.2.1', userAgent: 'test' })).resolves.toEqual(refused);
  });

  it('C-005 and C-008: never creates or links an unverified provider identity', async () => {
    const { service, flows, provider, accounts } = setup();
    provider.identity = { subject: 'unverified', email: 'person@example.com', emailVerified: false };
    await service.begin({ provider: 'google', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const state = [...flows.flows.keys()][0];
    if (state === undefined) throw new Error('OIDC flow was not saved.');
    await expect(service.callback(state, `https://console.example/auth/callback?state=${state}`, { ip: '192.0.2.1', userAgent: 'test' })).resolves.toMatchObject({ kind: 'refused' });
    expect(accounts.accounts).toHaveLength(0);
    expect(accounts.identities).toHaveLength(0);

    const verified = setup();
    await verified.accounts.create('person@example.com', null);
    await verified.service.begin({ provider: 'google', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const verifiedState = [...verified.flows.flows.keys()][0];
    if (verifiedState === undefined) throw new Error('OIDC flow was not saved.');
    await verified.service.callback(verifiedState, `https://console.example/auth/callback?state=${verifiedState}`, { ip: '192.0.2.1', userAgent: 'test' });
    verified.provider.identity = { subject: 'unverified-entra', email: 'person@example.com', emailVerified: false };
    await verified.service.begin({ provider: 'entra', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const unverifiedState = [...verified.flows.flows.keys()][0];
    if (unverifiedState === undefined) throw new Error('OIDC flow was not saved.');
    await verified.service.callback(unverifiedState, `https://console.example/auth/callback?state=${unverifiedState}`, { ip: '192.0.2.1', userAgent: 'test' });
    expect(verified.accounts.identities).toHaveLength(1);
  });

  it('C-006 and C-007: verified magic-link and OIDC identities share one account in either order', async () => {
    const { service, flows, accounts, invites, sessions } = setup();
    const account = await accounts.create('person@example.com', null);
    const magic = new MagicLinkService(accounts, invites, new MemoryMagicTokens(), new AllowAllRateLimiter(), sessions, new TestClock());
    const link = await magic.requestLink({ email: 'person@example.com', deviceNonce: 'device-nonce', ip: '192.0.2.1' });
    if (link.token === null) throw new Error('Magic link was not issued.');
    await magic.callback({ token: link.token, deviceNonce: 'device-nonce', ip: '192.0.2.1', userAgent: 'test' });
    await service.begin({ provider: 'google', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const state = [...flows.flows.keys()][0];
    if (state === undefined) throw new Error('OIDC flow was not saved.');
    await service.callback(state, `https://console.example/auth/callback?state=${state}`, { ip: '192.0.2.1', userAgent: 'test' });
    expect(accounts.accounts).toHaveLength(1);
    expect(accounts.identities).toHaveLength(2);

    const reverse = setup();
    const reverseAccount = await reverse.accounts.create('person@example.com', null);
    await reverse.service.begin({ provider: 'google', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const reverseState = [...reverse.flows.flows.keys()][0];
    if (reverseState === undefined) throw new Error('OIDC flow was not saved.');
    await reverse.service.callback(reverseState, `https://console.example/auth/callback?state=${reverseState}`, { ip: '192.0.2.1', userAgent: 'test' });
    const reverseMagic = new MagicLinkService(reverse.accounts, reverse.invites, new MemoryMagicTokens(), new AllowAllRateLimiter(), reverse.sessions, new TestClock());
    const reverseLink = await reverseMagic.requestLink({ email: 'person@example.com', deviceNonce: 'device-nonce', ip: '192.0.2.1' });
    if (reverseLink.token === null) throw new Error('Magic link was not issued.');
    await reverseMagic.callback({ token: reverseLink.token, deviceNonce: 'device-nonce', ip: '192.0.2.1', userAgent: 'test' });
    expect(reverse.accounts.accounts).toHaveLength(1);
    expect(reverse.accounts.identities).toHaveLength(2);
  });

  it('C-009, C-010 and C-011: JIT provisioning requires the pending invitation in the flow', async () => {
    const invite = { id: InviteId('018f8f9d-7f83-7abc-8def-000000000099'), email: 'person@example.com', role: 'viewer' as const, expiresAt: Timestamp(new Date('2027-01-01T00:00:00.000Z')) };
    const denied = setup();
    await denied.service.begin({ provider: 'google', companyId: null, inviteId: null, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const deniedState = [...denied.flows.flows.keys()][0];
    if (deniedState === undefined) throw new Error('OIDC flow was not saved.');
    await expect(denied.service.callback(deniedState, `https://console.example/auth/callback?state=${deniedState}`, { ip: '192.0.2.1', userAgent: 'test' })).resolves.toEqual({ kind: 'refused', message: 'Ask for an invitation before signing in.' });

    const invited = setup(invite);
    await invited.service.begin({ provider: 'google', companyId: null, inviteId: invite.id, redirectUri: 'https://console.example/auth/callback', deviceNonce: 'device-nonce' });
    const invitedState = [...invited.flows.flows.keys()][0];
    if (invitedState === undefined) throw new Error('OIDC flow was not saved.');
    await expect(invited.service.callback(invitedState, `https://console.example/auth/callback?state=${invitedState}`, { ip: '192.0.2.1', userAgent: 'test' })).resolves.toMatchObject({ kind: 'session' });
    expect(invited.accounts.accounts).toHaveLength(1);
    expect(invited.invites.accepted).toEqual([invite.id]);
  });
});
