import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionId, TestClock, TestIdFactory, UserId } from '../src/shared/kernel/index.js';
import { sessionCookie, sessionCookieName } from '../src/modules/identity/api/session-cookie.js';
import { markCurrentSession } from '../src/modules/identity/application/session.js';
import {
  RedisSessionStore,
  sessionAbsoluteTimeoutMs,
  sessionIdleTimeoutMs,
} from '../src/modules/identity/infrastructure/redis-session-store.js';
import { createRedisConnection, type RedisConnection } from '../src/platform/redis/index.js';

const redisUrl = process.env.REDIS_URL;
const redisTestsRequired = process.env.REQUIRE_DB_TESTS === '1';
const redisDescribe = redisUrl === undefined && !redisTestsRequired ? describe.skip : describe;
const user = UserId('018f8f9d-7f83-7abc-8def-0123456789ab');
const anotherUser = UserId('018f8f9d-7f83-7abc-8def-0123456789ac');
const meta = { ip: '192.0.2.1', userAgent: 'Test Browser', deviceNonce: 'device-nonce' };

let connection: RedisConnection | undefined;
let clock: TestClock;
let store: RedisSessionStore;

async function startStore(): Promise<void> {
  if (redisUrl === undefined) throw new Error('REDIS_URL is required when REQUIRE_DB_TESTS=1.');
  connection = createRedisConnection({ url: redisUrl });
  await connection.connect();
  await connection.client.flushDb();
  clock = new TestClock(new Date('2026-01-01T00:00:00.000Z'));
  store = new RedisSessionStore(connection.client, clock, new TestIdFactory());
}

afterEach(async () => {
  if (connection !== undefined) await connection.close();
  connection = undefined;
});

describe('session cookie', () => {
  it('D-001 and D-002: is secure and carries only the opaque session id', () => {
    const id = SessionId(new TestIdFactory().create<string>());
    const cookie = sessionCookie(id);

    expect(cookie).toBe(`${sessionCookieName}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    expect(cookie).not.toContain(user);
    expect(cookie.split(';')[0]?.split('=')[1]).toBe(id);
    expect(id).not.toContain('.');
  });
});

redisDescribe('Redis session store', () => {
  beforeEach(startStore);

  it('D-003: expires a session after eight idle hours', async () => {
    const id = await store.create(user, meta);
    clock.advance(sessionIdleTimeoutMs + 60_000);

    await expect(store.read(id)).resolves.toBeNull();
  });

  it('D-004: activity extends idle expiry', async () => {
    const id = await store.create(user, meta);
    clock.advance(sessionIdleTimeoutMs - 60_000);
    await store.touch(id);
    clock.advance(sessionIdleTimeoutMs - 60_000);

    await expect(store.read(id)).resolves.toMatchObject({ userId: user });
  });

  it('D-005: activity never extends the absolute expiry', async () => {
    const id = await store.create(user, meta);
    const activityInterval = sessionIdleTimeoutMs - 60_000;
    let elapsed = 0;
    while (elapsed + activityInterval < sessionAbsoluteTimeoutMs - 60_000) {
      clock.advance(activityInterval);
      elapsed += activityInterval;
      await store.touch(id);
    }
    clock.advance(sessionAbsoluteTimeoutMs - 60_000 - elapsed);
    await store.touch(id);
    clock.advance(60_000);

    await expect(store.read(id)).resolves.toBeNull();
  });

  it('D-006: revoke makes a session unreadable immediately', async () => {
    const id = await store.create(user, meta);

    await store.revoke(id);

    await expect(store.read(id)).resolves.toBeNull();
  });

  it('D-007: lists device metadata and lets the caller mark the current session', async () => {
    const current = await store.create(user, meta);
    const other = await store.create(user, { ...meta, userAgent: 'Other Browser' });

    const sessions = markCurrentSession(await store.listFor(user), current);

    expect(sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: current, current: true, meta }),
      expect.objectContaining({ id: other, current: false, meta: { ...meta, userAgent: 'Other Browser' } }),
    ]));
  });

  it('D-008: revoking another session does not leave it readable', async () => {
    const current = await store.create(user, meta);
    const other = await store.create(user, { ...meta, userAgent: 'Other Browser' });

    await store.revoke(other);

    await expect(store.read(current)).resolves.toMatchObject({ userId: user });
    await expect(store.read(other)).resolves.toBeNull();
  });

  it('D-009: a user cannot obtain another user’s session from their session list', async () => {
    const firstUserSession = await store.create(user, meta);
    await store.create(anotherUser, { ...meta, userAgent: 'Another User Browser' });

    await expect(store.listFor(anotherUser)).resolves.not.toContainEqual(expect.objectContaining({ id: firstUserSession }));
  });

  it('D-010: rotation issues a replacement and invalidates the old id', async () => {
    const id = await store.create(user, meta);

    const replacement = await store.rotate(id);

    expect(replacement).not.toBe(id);
    await expect(store.read(id)).resolves.toBeNull();
    await expect(store.read(replacement)).resolves.toMatchObject({ userId: user });
  });

  it('revokes every session except the supplied current session and returns the count', async () => {
    const current = await store.create(user, meta);
    const other = await store.create(user, { ...meta, userAgent: 'Other Browser' });
    await store.create(anotherUser, { ...meta, userAgent: 'Another User Browser' });

    await expect(store.revokeAllFor(user, current)).resolves.toBe(1);
    await expect(store.read(current)).resolves.toMatchObject({ userId: user });
    await expect(store.read(other)).resolves.toBeNull();
  });

  it('D-011: invalidates sessions when Redis session state is lost', async () => {
    const id = await store.create(user, meta);

    await connection?.client.flushDb();
    await expect(store.read(id)).resolves.toBeNull();
  });
});
