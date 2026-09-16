import { createHash, randomBytes } from 'node:crypto';
import type { Clock, InviteId, SessionId, Timestamp, UserId } from '../../../shared/kernel/index.js';
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
  markAccepted(id: InviteId, by: UserId): Promise<void>;
}

export interface MagicLinkRepository {
  issue(email: string, tokenHash: Buffer, deviceNonce: string, inviteId: InviteId | null, expiresAt: Timestamp, ip: string | null): Promise<void>;
  invalidateOutstanding(email: string): Promise<number>;
  consume(tokenHash: Buffer, deviceNonce: string, now: Timestamp): Promise<MagicLinkToken | null>;
  consumeConfirmed(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null>;
  peek(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null>;
}

export interface RateLimiter { check(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>; }

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
    await this.tokens.invalidateOutstanding(input.email);
    await this.tokens.issue(input.email, hash(token), input.deviceNonce, invite?.id ?? null, expiry(this.clock.now()), input.ip);
    return { allowed: true, retryAfterSeconds: 0, token };
  }

  async callback(input: Callback): Promise<CallbackResult> {
    const tokenHash = hash(input.token);
    const consumed = await this.tokens.consume(tokenHash, input.deviceNonce, this.clock.now());
    if (consumed !== null) return this.complete(consumed, input, false);
    return (await this.tokens.peek(tokenHash, this.clock.now())) === null ? { kind: 'invalid' } : { kind: 'device_mismatch' };
  }

  async confirm(input: Callback & { confirm: boolean }): Promise<CallbackResult> {
    const consumed = await this.tokens.consumeConfirmed(hash(input.token), this.clock.now());
    if (consumed === null || !input.confirm) return { kind: 'invalid' };
    return this.complete(consumed, input, true);
  }

  private async complete(token: MagicLinkToken, input: Callback, deviceConfirmed: boolean): Promise<CallbackResult> {
    const invite = token.inviteId === null ? null : await this.invites.findPendingFor(token.email);
    const account = await this.accounts.findByEmail(token.email) ?? await this.accounts.create(token.email, invite);
    await this.accounts.linkVerifiedIdentity(account.id, 'magic_link', token.email);
    if (invite !== null) await this.invites.markAccepted(invite.id, account.id);
    await this.accounts.recordLogin(account.id, this.clock.now());
    const sessionId = await this.sessions.create(account.id, { ip: input.ip, userAgent: input.userAgent, deviceNonce: token.deviceNonce }, 'magic_link', deviceConfirmed);
    return { kind: 'session', sessionId };
  }
}
