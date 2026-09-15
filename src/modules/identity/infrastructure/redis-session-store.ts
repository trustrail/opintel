import { z } from 'zod';
import {
  SessionId,
  Timestamp,
  UserId,
  type Clock,
  type IdFactory,
  type SessionId as SessionIdType,
} from '../../../shared/kernel/index.js';
import { redisKeyPrefix, type RedisClient } from '../../../platform/redis/index.js';
import type {
  AuthMethod,
  SessionMeta,
  SessionPort,
  SessionRecord,
  SessionSummary,
} from '../application/session.js';

export const sessionIdleTimeoutMs = 8 * 60 * 60 * 1_000;
export const sessionAbsoluteTimeoutMs = 30 * 24 * 60 * 60 * 1_000;

const sessions = redisKeyPrefix('session');
const sessionsForUser = redisKeyPrefix('session-user');

const storedSessionSchema = z.object({
  userId: z.string().uuid(),
  method: z.union([z.literal('magic_link'), z.string().regex(/^oidc:.+$/u)]),
  createdAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }),
  deviceConfirmed: z.boolean(),
  meta: z.object({
    ip: z.string(),
    userAgent: z.string(),
    deviceNonce: z.string(),
  }),
});

type StoredSession = z.infer<typeof storedSessionSchema>;

function timestampMilliseconds(timestamp: string): number {
  return new Date(timestamp).getTime();
}

function isExpired(record: SessionRecord, now: string): boolean {
  const nowMilliseconds = timestampMilliseconds(now);
  return nowMilliseconds - timestampMilliseconds(record.lastSeenAt) >= sessionIdleTimeoutMs
    || nowMilliseconds - timestampMilliseconds(record.createdAt) >= sessionAbsoluteTimeoutMs;
}

function sessionRecord(stored: StoredSession): SessionRecord {
  return {
    userId: UserId(stored.userId),
    method: stored.method as AuthMethod,
    createdAt: Timestamp(new Date(stored.createdAt)),
    lastSeenAt: Timestamp(new Date(stored.lastSeenAt)),
    deviceConfirmed: stored.deviceConfirmed,
    meta: stored.meta,
  };
}

export class RedisSessionStore implements SessionPort {
  constructor(
    private readonly client: RedisClient,
    private readonly clock: Clock,
    private readonly idFactory: IdFactory,
  ) {}

  async create(user: UserId, meta: SessionMeta): Promise<SessionIdType> {
    const now = this.clock.now();
    const id = SessionId(this.idFactory.create<string>());
    await this.write(id, {
      userId: user,
      method: 'magic_link',
      createdAt: now,
      lastSeenAt: now,
      deviceConfirmed: false,
      meta,
    });
    return id;
  }

  async read(id: SessionIdType): Promise<SessionRecord | null> {
    const record = await this.load(id);
    if (record === null) return null;
    if (!isExpired(record, this.clock.now())) return record;

    await this.remove(id, record.userId);
    return null;
  }

  async touch(id: SessionIdType): Promise<void> {
    const record = await this.read(id);
    if (record === null) return;

    await this.write(id, { ...record, lastSeenAt: this.clock.now() });
  }

  async rotate(id: SessionIdType): Promise<SessionIdType> {
    const record = await this.read(id);
    if (record === null) return id;

    const replacement = SessionId(this.idFactory.create<string>());
    await this.write(replacement, record);
    await this.remove(id, record.userId);
    return replacement;
  }

  async revoke(id: SessionIdType): Promise<void> {
    const record = await this.load(id);
    if (record === null) {
      await this.client.del(sessions.key(id));
      return;
    }
    await this.remove(id, record.userId);
  }

  async revokeAllFor(user: UserId, except?: SessionIdType): Promise<number> {
    const ids = await this.client.sMembers(sessionsForUser.key(user));
    let revoked = 0;

    for (const rawId of ids) {
      let id: SessionIdType;
      try {
        id = SessionId(rawId);
      } catch {
        await this.client.sRem(sessionsForUser.key(user), rawId);
        continue;
      }
      if (id === except) continue;
      const record = await this.load(id);
      if (record === null || record.userId !== user) {
        await this.client.sRem(sessionsForUser.key(user), id);
        continue;
      }
      await this.remove(id, user);
      revoked += 1;
    }
    return revoked;
  }

  async listFor(user: UserId): Promise<SessionSummary[]> {
    const ids = await this.client.sMembers(sessionsForUser.key(user));
    const summaries: SessionSummary[] = [];

    for (const rawId of ids) {
      let id: SessionIdType;
      try {
        id = SessionId(rawId);
      } catch {
        await this.client.sRem(sessionsForUser.key(user), rawId);
        continue;
      }
      const record = await this.read(id);
      if (record === null || record.userId !== user) continue;
      summaries.push({ id, meta: record.meta, lastSeenAt: record.lastSeenAt, current: false });
    }
    return summaries;
  }

  private async load(id: SessionIdType): Promise<SessionRecord | null> {
    const value = await this.client.get(sessions.key(id));
    if (value === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      await this.client.del(sessions.key(id));
      return null;
    }
    const validated = storedSessionSchema.safeParse(parsed);
    if (!validated.success) {
      await this.client.del(sessions.key(id));
      return null;
    }
    return sessionRecord(validated.data);
  }

  private async write(id: SessionIdType, record: SessionRecord): Promise<void> {
    const remainingAbsolute = sessionAbsoluteTimeoutMs
      - (timestampMilliseconds(this.clock.now()) - timestampMilliseconds(record.createdAt));
    const ttl = Math.min(sessionIdleTimeoutMs, remainingAbsolute);
    if (ttl <= 0) {
      await this.remove(id, record.userId);
      return;
    }

    await this.client.set(sessions.key(id), JSON.stringify(record), { PX: ttl });
    await this.client.sAdd(sessionsForUser.key(record.userId), id);
  }

  private async remove(id: SessionIdType, user: UserId): Promise<void> {
    await this.client.del(sessions.key(id));
    await this.client.sRem(sessionsForUser.key(user), id);
  }
}
