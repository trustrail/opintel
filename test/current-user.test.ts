import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionId, UserId, type SessionId as SessionIdType } from '../src/shared/kernel/index.js';
import { currentUserRoutes } from '../src/modules/identity/api/current-user-routes.js';
import { CurrentUserService, type CurrentUserRepository } from '../src/modules/identity/application/current-user.js';
import type { SessionPort, SessionRecord, SessionSummary } from '../src/modules/identity/application/session.js';
import { sessionCookie, sessionCookieName } from '../src/modules/identity/api/session-cookie.js';
import { createHttpServer } from '../src/platform/http/index.js';

const sessionId = SessionId('018f8f9d-7f83-7abc-8def-0123456789ab');
const userId = UserId('018f8f9d-7f83-7abc-8def-0123456789ac');
const session: SessionRecord = {
  userId,
  method: 'magic_link',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  deviceConfirmed: true,
  meta: { ip: '192.0.2.1', userAgent: 'test', deviceNonce: 'nonce' },
};

class TestSessions implements SessionPort {
  touched: SessionIdType | null = null;
  constructor(private readonly record: SessionRecord | null) {}
  async create(): Promise<SessionIdType> { return sessionId; }
  async read(): Promise<SessionRecord | null> { return this.record; }
  async touch(id: SessionIdType): Promise<void> { this.touched = id; }
  async rotate(id: SessionIdType): Promise<SessionIdType> { return id; }
  async revoke(): Promise<void> {}
  async revokeAllFor(): Promise<number> { return 0; }
  async listFor(): Promise<SessionSummary[]> { return []; }
}

class TestAccounts implements CurrentUserRepository {
  constructor(private readonly account: Awaited<ReturnType<CurrentUserRepository['findById']>>) {}
  async findById() { return this.account; }
}

const servers: ReturnType<typeof createHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).filter((server) => server.listening).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

async function request(service: CurrentUserService, cookie?: string): Promise<Response> {
  const server = createHttpServer(currentUserRoutes(service), { requestIdFactory: () => 'req-current-user' });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind to TCP.');
  return fetch(`http://127.0.0.1:${(address as AddressInfo).port}/api/v1/auth/me`, cookie === undefined ? {} : { headers: { cookie } });
}

describe('GET /auth/me', () => {
  it('assembles CurrentUser from the session and the current account record', async () => {
    const sessions = new TestSessions(session);
    const response = await request(new CurrentUserService(sessions, new TestAccounts({ id: userId, email: 'person@example.com', fullName: 'Person Example', timezone: 'America/Toronto' })), sessionCookie(sessionId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: userId,
      email: 'person@example.com',
      fullName: 'Person Example',
      timezone: 'America/Toronto',
      method: 'magic_link',
      sessionCreatedAt: '2026-01-01T00:00:00.000Z',
      deviceConfirmed: true,
    });
    expect(sessions.touched).toBe(sessionId);
  });

  it('returns a 401 error envelope when the session cookie is absent or unreadable', async () => {
    const service = new CurrentUserService(new TestSessions(null), new TestAccounts(null));
    const absent = await request(service);
    const malformed = await request(service, `${sessionCookieName}=not-a-session`);

    for (const response of [absent, malformed]) {
      expect(response.status).toBe(401);
      expect(response.headers.get('x-request-id')).toBe('req-current-user');
      await expect(response.json()).resolves.toEqual({
        error: { code: 'unauthenticated', message: 'Sign in is required.', requestId: 'req-current-user', retryable: false },
      });
    }
  });
});
