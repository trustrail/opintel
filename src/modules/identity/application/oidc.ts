import { randomBytes } from 'node:crypto';
import { DomainError, Timestamp, type Clock, type CompanyId, type InviteId, type SessionId } from '../../../shared/kernel/index.js';
import type { VaultRef } from '../../../platform/vault/index.js';
import type { AccountRepository, InviteRepository } from './magic-link.js';
import type { SessionPort } from './session.js';

export type OidcFlowState = {
  codeVerifier: string;
  nonce: string;
  provider: string;
  companyId: CompanyId | null;
  redirectUri: string;
  inviteId: InviteId | null;
  deviceNonce: string;
  createdAt: Timestamp;
};

export type OidcProviderConfiguration = {
  provider: string;
  issuer: string;
  clientId: string;
  clientSecretRef: VaultRef;
  discoveryUrl: string | null;
};

export type VerifiedOidcIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
};

export interface OidcFlowStore {
  save(state: string, flow: OidcFlowState): Promise<void>;
  consume(state: string): Promise<OidcFlowState | null>;
}

export interface OidcProviderPort {
  authorizationUrl(configuration: OidcProviderConfiguration, state: string, flow: OidcFlowState): Promise<string>;
  exchange(configuration: OidcProviderConfiguration, state: string, callbackUrl: string, flow: OidcFlowState): Promise<VerifiedOidcIdentity>;
}

export interface OidcConfigurationRepository {
  find(provider: string, companyId: CompanyId | null): Promise<OidcProviderConfiguration | null>;
}

export type OidcStartInput = {
  provider: string;
  companyId: CompanyId | null;
  inviteId: InviteId | null;
  redirectUri: string;
  deviceNonce: string;
};

export type OidcCallbackResult =
  | { kind: 'session'; sessionId: SessionId }
  | { kind: 'refused'; message: string };

const invitationRequiredMessage = 'Ask for an invitation before signing in.';
const invalidCallbackMessage = 'This sign-in request is no longer valid.';

function token(): string {
  return randomBytes(32).toString('base64url');
}

export class OidcService {
  constructor(
    private readonly configurations: OidcConfigurationRepository,
    private readonly flows: OidcFlowStore,
    private readonly providers: OidcProviderPort,
    private readonly accounts: AccountRepository,
    private readonly invites: InviteRepository,
    private readonly sessions: SessionPort,
    private readonly clock: Clock,
  ) {}

  async begin(input: OidcStartInput): Promise<{ authorizationUrl: string }> {
    const configuration = await this.configurations.find(input.provider, input.companyId);
    if (configuration === null) throw new DomainError('not_found', 'The requested sign-in provider is unavailable.');

    const state = token();
    const flow: OidcFlowState = {
      codeVerifier: token(),
      nonce: token(),
      provider: input.provider,
      companyId: input.companyId,
      redirectUri: input.redirectUri,
      inviteId: input.inviteId,
      deviceNonce: input.deviceNonce,
      createdAt: this.clock.now(),
    };
    await this.flows.save(state, flow);
    return { authorizationUrl: await this.providers.authorizationUrl(configuration, state, flow) };
  }

  async callback(state: string, callbackUrl: string, meta: { ip: string; userAgent: string }): Promise<OidcCallbackResult> {
    const flow = await this.flows.consume(state);
    if (flow === null) return { kind: 'refused', message: invalidCallbackMessage };

    const configuration = await this.configurations.find(flow.provider, flow.companyId);
    if (configuration === null) return { kind: 'refused', message: invalidCallbackMessage };

    let identity: VerifiedOidcIdentity;
    try {
      identity = await this.providers.exchange(configuration, state, callbackUrl, flow);
    } catch {
      return { kind: 'refused', message: invalidCallbackMessage };
    }
    if (!identity.emailVerified) return { kind: 'refused', message: invalidCallbackMessage };

    const pendingInvite = flow.inviteId === null ? null : await this.invites.findPendingFor(identity.email);
    const invite = pendingInvite?.id === flow.inviteId ? pendingInvite : null;
    let account = await this.accounts.findByEmail(identity.email);
    if (account === null && invite === null) return { kind: 'refused', message: invitationRequiredMessage };
    if (account === null) account = await this.accounts.create(identity.email, invite);

    await this.accounts.linkVerifiedIdentity(account.id, `oidc:${flow.provider}`, identity.subject);
    if (invite !== null) await this.invites.markAccepted(invite.id, account.id);
    await this.accounts.recordLogin(account.id, this.clock.now());
    const sessionId = await this.sessions.create(
      account.id,
      { ...meta, deviceNonce: flow.deviceNonce },
      `oidc:${flow.provider}`,
      true,
    );
    return { kind: 'session', sessionId };
  }
}

export { invalidCallbackMessage, invitationRequiredMessage };
