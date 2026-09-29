import { randomBytes } from 'node:crypto';
import { DomainError, Timestamp, type Clock, type CompanyId, type CompanyIdpId, type InviteId, type SessionId, type UserId } from '../../../shared/kernel/index.js';
import type { SecretRef } from '../../../platform/secrets/index.js';
import type { AccountRepository, InviteRepository } from './magic-link.js';
import type { SessionPort } from './session.js';

export type OidcFlowState = {
  configuration: OidcProviderConfiguration;
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
  id: CompanyIdpId | null;
  configurationVersion: string;
  scope: string;
  provider: string;
  issuer: string;
  clientId: string;
  clientSecretRef: SecretRef;
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
  recordCompletedSignIn(companyId: CompanyId | null, configuration: OidcProviderConfiguration, userId: UserId, sessionId: SessionId, at: Timestamp): Promise<boolean>;
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

  async begin(input: OidcStartInput): Promise<{ authorizationUrl: string; state: string }> {
    const configuration = await this.configurations.find(input.provider, input.companyId);
    if (configuration === null) throw new DomainError('not_found', 'The requested sign-in provider is unavailable.');

    const state = token();
    const flow: OidcFlowState = {
      configuration,
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
    return { authorizationUrl: await this.providers.authorizationUrl(configuration, state, flow), state };
  }

  async callback(state: string, callbackUrl: string, meta: { ip: string; userAgent: string }, expectedProvider?: string): Promise<OidcCallbackResult> {
    const flow = await this.flows.consume(state);
    if (flow === null || (expectedProvider !== undefined && flow.provider !== expectedProvider)) return { kind: 'refused', message: invalidCallbackMessage };

    const configuration = await this.configurations.find(flow.provider, flow.companyId);
    if (configuration === null || configuration.configurationVersion !== flow.configuration.configurationVersion || configuration.id !== flow.configuration.id) return { kind: 'refused', message: invalidCallbackMessage };

    let identity: VerifiedOidcIdentity;
    try {
      identity = await this.providers.exchange(flow.configuration, state, callbackUrl, flow);
    } catch {
      return { kind: 'refused', message: invalidCallbackMessage };
    }
    if (!identity.emailVerified) return { kind: 'refused', message: invalidCallbackMessage };

    const pendingInvite = flow.inviteId === null ? await this.invites.findPendingFor(identity.email) : await this.invites.findInvitationById(flow.inviteId);
    const invite = pendingInvite?.email.toLowerCase() === identity.email.toLowerCase() ? pendingInvite : null;
    let account = await this.accounts.findByEmail(identity.email);
    if (account === null && invite === null) return { kind: 'refused', message: invitationRequiredMessage };
    if (account === null) account = await this.accounts.create(identity.email, invite);

    await this.accounts.linkVerifiedIdentity(account.id, (flow.provider.startsWith('oidc:') ? flow.provider : `oidc:${flow.provider}`) as `oidc:${string}`, identity.subject);
    if (invite !== null) await this.invites.markAccepted(invite.id, account.id);
    await this.accounts.recordLogin(account.id, this.clock.now());
    const sessionId = await this.sessions.create(
      account.id,
      { ...meta, deviceNonce: flow.deviceNonce },
      (flow.provider.startsWith('oidc:') ? flow.provider : `oidc:${flow.provider}`) as `oidc:${string}`,
      true,
    );
    try {
      if (!await this.configurations.recordCompletedSignIn(flow.companyId, flow.configuration, account.id, sessionId, this.clock.now())) {
        await this.sessions.revoke(sessionId);
        return { kind: 'refused', message: invalidCallbackMessage };
      }
    } catch (error) { await this.sessions.revoke(sessionId); throw error; }
    return { kind: 'session', sessionId };
  }
}

export { invalidCallbackMessage, invitationRequiredMessage };
