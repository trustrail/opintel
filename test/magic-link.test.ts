import { resetDatabaseBeforeEach } from './database-fixture.js';
import { InvitationService } from '../src/modules/tenancy/application/invitations.js';
import { PostgresInvitationRepository } from '../src/modules/tenancy/infrastructure/invitation-repository.js';
import { RelationshipOutbox } from '../src/modules/tenancy/application/relationship-outbox.js';
import type { AuthorizationPort, ZedToken } from '../src/modules/authz/index.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TestClock, TestIdFactory } from '../src/shared/kernel/index.js';
import { MagicLinkService } from '../src/modules/identity/application/magic-link.js';
import { PostgresIdentityRepository, RedisRateLimiter } from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import { RedisSessionStore } from '../src/modules/identity/infrastructure/redis-session-store.js';
import { withPlatform } from '../src/platform/db/scope.js';
import { createRedisConnection, type RedisConnection } from '../src/platform/redis/index.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { magicLinkRoutes } from '../src/modules/identity/api/magic-link-routes.js';
import { LocalFileMailAdapter, MailOutbox } from '../src/platform/mail/index.js';
import { OutboxMagicLinkDispatcher } from '../src/modules/identity/infrastructure/magic-link-mail-dispatcher.js';

const redisUrl = process.env.REDIS_URL;
const required = process.env.REQUIRE_DB_TESTS === '1';
const integration = (redisUrl === undefined || process.env.DATABASE_URL === undefined) && !required ? describe.skip : describe;
const magicLinkRedisUrl = redisUrl === undefined ? undefined : (() => {
  const url = new URL(redisUrl);
  url.pathname = '/1';
  return url.toString();
})();
integration('magic links', () => {
  resetDatabaseBeforeEach('company', 'user_account', 'mail_outbox', 'relationship_outbox');
  let connection: RedisConnection | undefined;
  let service: MagicLinkService;
  let clock: TestClock;

  function redisConnection(): RedisConnection {
    if (connection === undefined) throw new Error('Redis connection is missing.');
    return connection;
  }

  beforeEach(async () => {
    if (redisUrl === undefined || process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL and REDIS_URL are required when REQUIRE_DB_TESTS=1.');
    connection = createRedisConnection({ url: magicLinkRedisUrl ?? redisUrl });
    await connection.connect();
    await connection.client.flushDb();
    clock = new TestClock(new Date('2026-01-01T00:00:00.000Z'));
    const outbox = new RelationshipOutbox();
    const authorization: AuthorizationPort = {
      check: async () => ({ allowed: true, checkedAt: clock.now(), token: 'test' as ZedToken, snapshotAgeMs: 0 }),
      checkMany: async () => [], write: async () => 'test' as ZedToken, explain: async () => ({ allowed: true, path: [] }),
    };
    const invitations = new InvitationService(new PostgresInvitationRepository(outbox), outbox, authorization, clock, { dispatch: async () => {} });
    const repository = new PostgresIdentityRepository(clock, invitations);
    service = new MagicLinkService(repository, repository, repository, new RedisRateLimiter(connection.client), new RedisSessionStore(connection.client, clock, new TestIdFactory()), clock);
    await repository.create('known@example.com', null);
  });

  afterEach(async () => { if (connection !== undefined) await connection.close(); connection = undefined; });

  const request = { email: 'known@example.com', deviceNonce: 'nonce', ip: '192.0.2.1' };
  const callback = (token: string, deviceNonce = 'nonce') => ({ token, deviceNonce, ip: '192.0.2.1', userAgent: 'test' });

  it('B-001, B-002 and B-014: consumes a link exactly once atomically', async () => {
    const issued = await service.requestLink(request);
    if (issued.token === null) throw new Error('Expected token.');
    const results = await Promise.all([service.callback(callback(issued.token)), service.callback(callback(issued.token))]);
    expect(results.filter((result) => result.kind === 'session')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'invalid')).toHaveLength(1);
  });

  it('B-003, B-004 and B-006: accepts before expiry, expires after it, and invalidates outstanding links', async () => {
    const first = await service.requestLink(request);
    const second = await service.requestLink(request);
    if (first.token === null || second.token === null) throw new Error('Expected tokens.');
    await expect(service.callback(callback(first.token))).resolves.toEqual({ kind: 'invalid' });
    clock.advance(14 * 60 * 1_000 + 59 * 1_000);
    await expect(service.callback(callback(second.token))).resolves.toMatchObject({ kind: 'session' });
    const expired = await service.requestLink({ ...request, deviceNonce: 'new-nonce' });
    if (expired.token === null) throw new Error('Expected token.');
    clock.advance(15 * 60 * 1_000 + 1);
    await expect(service.callback(callback(expired.token, 'new-nonce'))).resolves.toEqual({ kind: 'invalid' });
  });

  it('B-007, B-008, B-009 and B-013: requires confirmation without a matching nonce', async () => {
    const issued = await service.requestLink(request);
    if (issued.token === null) throw new Error('Expected token.');
    await expect(service.callback(callback(issued.token, 'other'))).resolves.toEqual({ kind: 'device_mismatch' });
    await expect(service.confirm({ ...callback(issued.token, 'other'), confirm: false })).resolves.toEqual({ kind: 'invalid' });
    await expect(service.confirm({ ...callback(issued.token, 'other'), confirm: true })).resolves.toEqual({ kind: 'invalid' });

    const confirmed = await service.requestLink({ ...request, deviceNonce: 'new-nonce' });
    if (confirmed.token === null) throw new Error('Expected token.');
    const result = await service.callback(callback(confirmed.token, 'other'));
    expect(result).toEqual({ kind: 'device_mismatch' });
    const session = await service.confirm({ ...callback(confirmed.token, 'other'), confirm: true });
    expect(session).toMatchObject({ kind: 'session' });
  });

  it('B-005 and B-012: stores only a hash and rejects a tampered token', async () => {
    const issued = await service.requestLink(request);
    if (issued.token === null) throw new Error('Expected token.');
    const rows = await withPlatform((tx) => tx.query<{ tokenHash: string }>('SELECT encode(token_hash, \'hex\') AS "tokenHash" FROM magic_link_token'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(issued.token);
    const outboxRows = await withPlatform((tx) => tx.query<{ vars: string }>('SELECT vars::text AS vars FROM mail_outbox'));
    expect(outboxRows.length).toBeGreaterThan(0);
    for (const row of outboxRows) expect(row.vars).not.toContain(issued.token);
    const tampered = `${issued.token.slice(0, -1)}${issued.token.endsWith('A') ? 'B' : 'A'}`;
    await expect(service.callback(callback(tampered))).resolves.toEqual({ kind: 'invalid' });
  });

  it('writes a usable magic-link URL for a known account and nothing for an unknown account', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'opintel-magic-link-'));
    try {
      const repository = new PostgresIdentityRepository(clock);
      const loggedUrls: URL[] = [];
      const dispatcher = new OutboxMagicLinkDispatcher(
        new MailOutbox(),
        new LocalFileMailAdapter(directory, clock, (url) => { loggedUrls.push(url); }, 'http://localhost:5173'),
      );
      const delivered = new MagicLinkService(repository, repository, repository, new RedisRateLimiter(redisConnection().client), new RedisSessionStore(redisConnection().client, clock, new TestIdFactory()), clock, dispatcher);
      const known = await delivered.requestLink(request);
      if (known.token === null) throw new Error('Expected token.');
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      const contents = await readFile(path.join(directory, files[0] ?? ''), 'utf8');
      const expectedUrl = `http://localhost:5173/auth/callback?token=${known.token}`;
      expect(contents).toContain(expectedUrl);
      expect(loggedUrls.map((url) => url.toString())).toEqual([expectedUrl]);

      const unknown = await delivered.requestLink({ ...request, email: 'unknown@example.com' });
      expect(unknown.token).toBeNull();
      expect(await readdir(directory)).toHaveLength(1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('B-010 and B-011: rate limits known and unknown addresses with the same response shape', async () => {
    const knownInput = { ...request, ip: '192.0.2.10' };
    const unknownInput = { ...request, email: 'other@example.com', ip: '192.0.2.11' };
    for (let index = 0; index < 3; index += 1) {
      await service.requestLink(knownInput);
      await service.requestLink(unknownInput);
    }
    const known = await service.requestLink(knownInput);
    const unknown = await service.requestLink(unknownInput);
    expect(known.allowed).toBe(false);
    expect(unknown.allowed).toBe(false);
    expect(known.retryAfterSeconds).toBe(unknown.retryAfterSeconds);
  });

  it('B-015: accepts an invite while preserving its intended role', async () => {
    const invitation = await withPlatform(async (tx) => {
      const industry = await tx.query<{ id: string }>("SELECT id FROM industry LIMIT 1");
      const industryId = industry[0]?.id;
      if (industryId === undefined) throw new Error('Seed industry is missing.');
      const company = await tx.query<{ id: string }>('INSERT INTO company (name, default_industry_id, default_region) VALUES ($1, $2, $3) RETURNING id', ['Test company', industryId, 'ca-central-1']);
      const companyId = company[0]?.id;
      if (companyId === undefined) throw new Error('Company creation failed.');
      const project = await tx.query<{ id: string }>('INSERT INTO project (company_id, industry_id, name, region) VALUES ($1, $2, $3, $4) RETURNING id', [companyId, industryId, 'Test project', 'ca-central-1']);
      const projectId = project[0]?.id;
      if (projectId === undefined) throw new Error('Project creation failed.');
      const creator = await tx.query<{ id: string }>('SELECT id FROM user_account WHERE email = $1', ['known@example.com']);
      const creatorId = creator[0]?.id;
      if (creatorId === undefined) throw new Error('Creator is missing.');
      const invite = await tx.query<{ id: string }>("INSERT INTO pending_invite (email, company_id, project_id, role, token_hash, expires_at, created_by) VALUES ($1, $2, $3, 'operator', decode('00', 'hex'), $4, $5) RETURNING id", ['invitee@example.com', companyId, projectId, '2027-01-01T00:00:00.000Z', creatorId]);
      const id = invite[0]?.id;
      if (id === undefined) throw new Error('Invite creation failed.');
      return id;
    });
    const issued = await service.requestLink({ ...request, email: 'invitee@example.com' });
    if (issued.token === null) throw new Error('Expected token.');
    await expect(service.callback(callback(issued.token))).resolves.toMatchObject({ kind: 'session' });
    const rows = await withPlatform((tx) => tx.query<{ role: string; accepted_at: string | null }>('SELECT role, accepted_at FROM pending_invite WHERE id = $1', [invitation]));
    expect(rows[0]).toMatchObject({ role: 'operator' });
    expect(rows[0]?.accepted_at).not.toBeNull();
  });

  it('A-005, A-006 and the request-link contract: always returns 202 with an empty body', async () => {
    const server = createHttpServer(magicLinkRoutes(service));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as AddressInfo;
      const post = async (email: string) => fetch(`http://127.0.0.1:${address.port}/api/v1/auth/request-link`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, deviceNonce: 'nonce' }),
      });
      const [known, unknown] = await Promise.all([post('known@example.com'), post('unknown@example.com')]);
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(await known.text()).toBe('');
      expect(await unknown.text()).toBe('');
      expect(known.headers.get('x-request-id')).toBeTruthy();
      expect(unknown.headers.get('x-request-id')).toBeTruthy();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
    }
  });
});
