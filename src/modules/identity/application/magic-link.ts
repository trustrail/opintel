import { createHash, randomBytes } from 'node:crypto';
import { DomainError, type Clock, type InviteId, type Result, type SessionId, type Timestamp, type UserId } from '../../../shared/kernel/index.js';
import type { SessionPort } from './session.js';

export type PendingInvite = { id: InviteId; email: string; role: 'admin' | 'operator' | 'viewer'; expiresAt: Timestamp };
export type UserAccount = { id: UserId; email: string };
export type MagicLinkToken = { id: string; email: string; deviceNonce: string; inviteId: InviteId | null };

export interface AccountRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  create(email: string, invite: PendingInvite | null): Promise<UserAccount>;
  linkVerifiedIdentity(accountId: UserId, provider: string, subject: string): Promise<void>;
  recordLogin(id: UserId, at: Timestamp): Promise<void>;
}

export interface InviteRepository {
  findPendingFor(email: string): Promise<PendingInvite | null>;
  findInvitationById(id: InviteId): Promise<PendingInvite | null>;
  markAccepted(id: InviteId, by: UserId): Promise<void>;
}
export interface InvitationAcceptancePort {
  accept(id: InviteId, user: UserId): Promise<Result<void, DomainError>>;
}

export interface MagicLinkRepository {
  issue(email: string, tokenHash: Buffer, deviceNonce: string, inviteId: InviteId | null, expiresAt: Timestamp, ip: string | null): Promise<void>;
  issueAndEnqueue(email: string, tokenHash: Buffer, deviceNonce: string, inviteId: InviteId | null, expiresAt: Timestamp, ip: string | null): Promise<MagicLinkToken>;
  invalidateOutstanding(email: string): Promise<number>;
  consume(tokenHash: Buffer, deviceNonce: string, now: Timestamp): Promise<MagicLinkToken | null>;
  consumeConfirmed(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null>;
  peek(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null>;
  expiredInvitation(tokenHash: Buffer, now: Timestamp): Promise<boolean>;
}

export interface RateLimiter { check(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>; }
export interface MagicLinkDispatchPort { dispatch(message: { tokenId: string; token: string }): Promise<void>; }

export type RequestLink = { email: string; deviceNonce: string; ip: string | null };
export type Callback = { token: string; deviceNonce: string; ip: string; userAgent: string };
export type CallbackResult = { kind: 'session'; sessionId: SessionId } | { kind: 'device_mismatch' } | { kind: 'invalid' };

const lifetimeMs = 15 * 60 * 1_000;
const rateWindowMs = 15 * 60 * 1_000;

function hash(token: string): Buffer { return createHash('sha256').update(token).digest(); }
function expiry(now: Timestamp): Timestamp { return new Date(new Date(now).getTime() + lifetimeMs).toISOString() as Timestamp; }

export class MagicLinkService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly invites: InviteRepository,
    private readonly tokens: MagicLinkRepository,
    private readonly rateLimiter: RateLimiter,
    private readonly sessions: SessionPort,
    private readonly clock: Clock,
    private readonly delivery?: MagicLinkDispatchPort,
  ) {}

  async requestLink(input: RequestLink): Promise<{ allowed: boolean; retryAfterSeconds: number; token: string | null }> {
    const [emailLimit, ipLimit, account, invite] = await Promise.all([
      this.rateLimiter.check(`magic-link:email:${input.email}`, 3, rateWindowMs),
      this.rateLimiter.check(`magic-link:ip:${input.ip ?? 'unknown'}`, 10, rateWindowMs),
      this.accounts.findByEmail(input.email),
      this.invites.findPendingFor(input.email),
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) return { allowed: false, retryAfterSeconds: Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds), token: null };
    if (account === null && invite === null) return { allowed: true, retryAfterSeconds: 0, token: null };

    const token = randomBytes(32).toString('base64url');
    const issued = await this.tokens.issueAndEnqueue(input.email, hash(token), input.deviceNonce, invite?.id ?? null, expiry(this.clock.now()), input.ip);
    await this.delivery?.dispatch({ tokenId: issued.id, token });
    return { allowed: true, retryAfterSeconds: 0, token };
  }

  async callback(input: Callback): Promise<CallbackResult> {
    const tokenHash = hash(input.token);
    const consumed = await this.tokens.consume(tokenHash, input.deviceNonce, this.clock.now());
    if (consumed !== null) return this.complete(consumed, input, false);
    await this.rejectExpiredInvitation(tokenHash);
    return (await this.tokens.peek(tokenHash, this.clock.now())) === null ? { kind: 'invalid' } : { kind: 'device_mismatch' };
  }

  async confirm(input: Callback & { confirm: boolean }): Promise<CallbackResult> {
    const consumed = await this.tokens.consumeConfirmed(hash(input.token), this.clock.now());
    if (consumed === null) await this.rejectExpiredInvitation(hash(input.token));
    if (consumed === null || !input.confirm) return { kind: 'invalid' };
    return this.complete(consumed, input, true);
  }

  private async complete(token: MagicLinkToken, input: Callback, deviceConfirmed: boolean): Promise<CallbackResult> {
    const invite = token.inviteId === null ? null : await this.invites.findInvitationById(token.inviteId);
    if (invite !== null && invite.email.toLowerCase() !== token.email.toLowerCase()) {
      throw new DomainError('forbidden', 'This invitation belongs to another email address.');
    }
    if (invite !== null && new Date(invite.expiresAt).getTime() <= new Date(this.clock.now()).getTime()) {
      throw new DomainError('validation_failed', 'This invitation has expired. Ask an administrator for a new invitation.', { action: 'request_invitation' });
    }
    const email = invite?.email ?? token.email;
    const account = await this.accounts.findByEmail(email) ?? await this.accounts.create(email, invite);
    await this.accounts.linkVerifiedIdentity(account.id, 'magic_link', token.email);
    if (invite !== null) await this.invites.markAccepted(invite.id, account.id);
    await this.accounts.recordLogin(account.id, this.clock.now());
    const sessionId = await this.sessions.create(account.id, { ip: input.ip, userAgent: input.userAgent, deviceNonce: token.deviceNonce }, 'magic_link', deviceConfirmed);
    return { kind: 'session', sessionId };
  }

  private async rejectExpiredInvitation(tokenHash: Buffer): Promise<void> {
    if (await this.tokens.expiredInvitation(tokenHash, this.clock.now())) {
      throw new DomainError('validation_failed', 'This invitation has expired. Ask an administrator for a new invitation.', { action: 'request_invitation' });
    }
  }
}
