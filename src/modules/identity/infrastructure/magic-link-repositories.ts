import { DomainError, InviteId, Timestamp, UserId, type Clock } from '../../../shared/kernel/index.js';
import { withPlatform, type Tx } from '../../../platform/db/scope.js';
import { redisKeyPrefix, type RedisClient } from '../../../platform/redis/index.js';
import type { CurrentUserAccount, CurrentUserRepository } from '../application/current-user.js';
import type { AccountRepository, InviteRepository, MagicLinkRepository, MagicLinkToken, PendingInvite, RateLimiter, UserAccount } from '../application/magic-link.js';

type AccountRow = { id: string; email: string };
type CurrentUserRow = { id: string; email: string; full_name: string | null; timezone: string };
type InviteRow = { id: string; email: string; role: PendingInvite['role']; expires_at: string };
type TokenRow = { id: string; email: string; device_nonce: string; invite_id: string | null };

export class PostgresIdentityRepository implements AccountRepository, InviteRepository, MagicLinkRepository, CurrentUserRepository {
  constructor(private readonly now: Clock) {}
  async findByEmail(email: string): Promise<UserAccount | null> {
    const rows = await withPlatform((tx) => tx.query<AccountRow>('SELECT id, email FROM user_account WHERE email = $1', [email]));
    const row = rows[0]; return row === undefined ? null : { id: UserId(row.id), email: row.email };
  }
  async findById(id: UserId): Promise<CurrentUserAccount | null> {
    const rows = await withPlatform((tx) => tx.query<CurrentUserRow>('SELECT id, email, full_name, timezone FROM user_account WHERE id = $1', [id]));
    const row = rows[0];
    return row === undefined ? null : { id: UserId(row.id), email: row.email, fullName: row.full_name, timezone: row.timezone };
  }
  async create(email: string, _invite: PendingInvite | null): Promise<UserAccount> {
    const rows = await withPlatform((tx) => tx.query<AccountRow>('INSERT INTO user_account (email) VALUES ($1) RETURNING id, email', [email]));
    const row = rows[0]; if (row === undefined) throw new Error('Account creation returned no account.'); return { id: UserId(row.id), email: row.email };
  }
  async linkVerifiedIdentity(accountId: UserId, provider: string, subject: string): Promise<void> {
    const rows = await withPlatform((tx) => tx.query<{ user_id: string }>(
      `INSERT INTO user_identity (user_id, provider, provider_subject, email_verified)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (provider, provider_subject) DO UPDATE
       SET email_verified = true
       WHERE user_identity.user_id = EXCLUDED.user_id
       RETURNING user_id`,
      [accountId, provider, subject],
    ));
    if (rows[0] === undefined) {
      throw new DomainError('conflict', 'This identity is already linked to another account.');
    }
  }
  async recordLogin(id: UserId, at: Timestamp): Promise<void> { await withPlatform((tx) => tx.query('UPDATE user_account SET last_login_at = $2 WHERE id = $1', [id, at])); }
  async findPendingFor(email: string): Promise<PendingInvite | null> {
    const rows = await withPlatform((tx) => tx.query<InviteRow>('SELECT id, email, role, expires_at FROM pending_invite WHERE email = $1 AND accepted_at IS NULL AND expires_at > $2 ORDER BY expires_at DESC LIMIT 1', [email, this.now.now()]));
    const row = rows[0]; return row === undefined ? null : { id: InviteId(row.id), email: row.email, role: row.role, expiresAt: Timestamp(new Date(row.expires_at)) };
  }
  async markAccepted(id: import('../../../shared/kernel/index.js').InviteId, by: UserId): Promise<void> { await withPlatform((tx) => tx.query('UPDATE pending_invite SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL', [id])); void by; }
  async issue(email: string, tokenHash: Buffer, deviceNonce: string, inviteId: import('../../../shared/kernel/index.js').InviteId | null, expiresAt: Timestamp, ip: string | null): Promise<void> { await withPlatform((tx) => tx.query('INSERT INTO magic_link_token (email, token_hash, device_nonce, invite_id, expires_at, requested_ip) VALUES ($1, $2, $3, $4, $5, $6)', [email, tokenHash, deviceNonce, inviteId, expiresAt, ip])); }
  async issueAndEnqueue(email: string, tokenHash: Buffer, deviceNonce: string, inviteId: import('../../../shared/kernel/index.js').InviteId | null, expiresAt: Timestamp, ip: string | null): Promise<MagicLinkToken> {
    return withPlatform(async (tx) => {
      await tx.query('UPDATE magic_link_token SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL', [email]);
      const rows = await tx.query<TokenRow>('INSERT INTO magic_link_token (email, token_hash, device_nonce, invite_id, expires_at, requested_ip) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, device_nonce, invite_id', [email, tokenHash, deviceNonce, inviteId, expiresAt, ip]);
      const token = this.token(rows[0]);
      if (token === null) throw new Error('Magic-link issuance returned no token.');
      await tx.query('INSERT INTO mail_outbox (to_email, template, vars, idempotency_key) VALUES ($1, $2, $3::jsonb, $4)', [email, 'magic_link', JSON.stringify({ tokenId: token.id }), `magic_link:${token.id}`]);
      return token;
    });
  }
  async invalidateOutstanding(email: string): Promise<number> { const rows = await withPlatform((tx) => tx.query<{ count: string }>('WITH updated AS (UPDATE magic_link_token SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL RETURNING 1) SELECT count(*)::text AS count FROM updated', [email])); return Number(rows[0]?.count ?? '0'); }
  async consume(tokenHash: Buffer, deviceNonce: string, now: Timestamp): Promise<MagicLinkToken | null> { return this.consumeStatement('UPDATE magic_link_token SET consumed_at = $3 WHERE token_hash = $1 AND device_nonce = $2 AND consumed_at IS NULL AND expires_at > $3 RETURNING id, email, device_nonce, invite_id', [tokenHash, deviceNonce, now]); }
  async consumeConfirmed(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null> { return this.consumeStatement('UPDATE magic_link_token SET consumed_at = $2 WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2 RETURNING id, email, device_nonce, invite_id', [tokenHash, now]); }
  async peek(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null> { const rows = await withPlatform((tx) => tx.query<TokenRow>('SELECT id, email, device_nonce, invite_id FROM magic_link_token WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2', [tokenHash, now])); return this.token(rows[0]); }
  private async consumeStatement(sql: string, values: readonly unknown[]): Promise<MagicLinkToken | null> { const rows = await withPlatform((tx: Tx) => tx.query<TokenRow>(sql, values)); return this.token(rows[0]); }
  private token(row: TokenRow | undefined): MagicLinkToken | null { return row === undefined ? null : { id: row.id, email: row.email, deviceNonce: row.device_nonce, inviteId: row.invite_id === null ? null : InviteId(row.invite_id) }; }
}

const limiterKeys = redisKeyPrefix('rate-limit');
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly client: RedisClient) {}
  async check(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const redisKey = limiterKeys.key(key);
    const count = await this.client.incr(redisKey);
    if (count === 1) await this.client.pExpire(redisKey, windowMs);
    const retryAfterSeconds = count <= limit ? 0 : Math.min(2 ** (count - limit - 1), 16);
    return { allowed: count <= limit, retryAfterSeconds };
  }
}
