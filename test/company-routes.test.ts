import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationPort, RelationshipUpdate, ZedToken } from '../src/modules/authz/index.js';
import type { CurrentUser } from '../src/modules/identity/application/current-user.js';
import { CompanyView, companyRoutes } from '../src/modules/tenancy/api/company-routes.js';
import { CreateCompanyService } from '../src/modules/tenancy/application/create-company.js';
import { RelationshipOutbox } from '../src/modules/tenancy/index.js';
import { PostgresCompanyCreationRepository } from '../src/modules/tenancy/infrastructure/company-creation-repository.js';
import { withPlatform, type Tx } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { Timestamp, UserId } from '../src/shared/kernel/index.js';

const databaseDescribe = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
const servers: ReturnType<typeof createHttpServer>[] = [];
const token = 'company-create-token' as ZedToken;
const write = vi.fn<AuthorizationPort['write']>();
const unexpectedCall = async (): Promise<never> => { throw new Error('Unexpected authorization read.'); };
const authorization: AuthorizationPort = { write, check: unexpectedCall, checkMany: unexpectedCall, explain: unexpectedCall };
let actor: CurrentUser;

async function post(body: unknown, user: CurrentUser | null = actor, outbox = new RelationshipOutbox()) {
  const service = new CreateCompanyService(new PostgresCompanyCreationRepository(outbox), outbox, authorization);
  const server = createHttpServer(companyRoutes(service), {
    authorization: { currentUser: async () => user }, logger: { error: () => {} },
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No server address.');
  return fetch(`http://127.0.0.1:${address.port}/api/v1/companies`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function input() {
  return { name: `Company ${randomUUID()}`, defaultRegion: 'eu-west-1', defaultIndustryId: null };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

databaseDescribe('POST /companies with Postgres', () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required.');
    actor = {
      id: UserId(randomUUID()), email: `${randomUUID()}@example.com`, fullName: null, timezone: 'UTC',
      method: 'magic_link', sessionCreatedAt: Timestamp(new Date()), deviceConfirmed: true,
    };
    await withPlatform((tx) => tx.query('INSERT INTO user_account (id, email) VALUES ($1, $2)', [actor.id, actor.email]));
    write.mockReset().mockResolvedValue(token);
  });

  it.each([false, true])('commits company, admin membership and outbox before dispatch (industry=%s)', async (withIndustry) => {
    const industries = await withPlatform((tx) => tx.query<{ id: string }>('SELECT id FROM industry ORDER BY id LIMIT 1'));
    const industryId = withIndustry ? industries[0]?.id : null;
    if (industryId === undefined) throw new Error('Seed industry is missing.');
    const body = { ...input(), defaultIndustryId: industryId };
    write.mockImplementation(async (updates) => {
      const update = updates[0];
      if (update === undefined) throw new Error('Missing relationship.');
      // A second transaction can see all three records before SpiceDB returns.
      const rows = await withPlatform((tx) => tx.query<{ role: string; written_at: Date | null }>(
        `SELECT m.role, o.written_at FROM company c
         JOIN company_member m ON m.company_id = c.id
         JOIN relationship_outbox o ON o.resource_id = c.id::text
         WHERE c.id = $1 AND m.user_id = $2 AND o.subject_id = $2::text`,
        [update.resource.id, actor.id],
      ));
      expect(rows).toEqual([{ role: 'admin', written_at: null }]);
      return token;
    });

    const response = await post(body);
    expect(response.status).toBe(201);
    const company = CompanyView.parse(await response.json());
    expect(company).toMatchObject(body);
    expect(write).toHaveBeenCalledExactlyOnceWith([{
      operation: 'touch', resource: { type: 'company', id: company.id },
      relation: 'admin', subject: { type: 'user', id: actor.id },
    }]);
    const rows = await withPlatform((tx) => tx.query<{ zed_token: string; written_at: Date }>(
      'SELECT zed_token, written_at FROM relationship_outbox WHERE resource_id = $1', [company.id],
    ));
    expect(rows).toEqual([{ zed_token: token, written_at: expect.any(Date) }]);
  });

  it('returns 503 and retains the committed company and pending grant when SpiceDB fails', async () => {
    write.mockRejectedValue(new Error('unavailable'));
    const body = input();
    const response = await post(body);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'dependency_unavailable', retryable: true } });
    const rows = await withPlatform((tx) => tx.query(
      `SELECT m.role, o.written_at, o.zed_token, o.attempts FROM company c
       JOIN company_member m ON m.company_id = c.id
       JOIN relationship_outbox o ON o.resource_id = c.id::text WHERE c.name = $1`, [body.name],
    ));
    expect(rows).toEqual([{ role: 'admin', written_at: null, zed_token: null, attempts: 1 }]);
  });

  it('rolls back all three records and never dispatches if the transaction fails', async () => {
    class FailingOutbox extends RelationshipOutbox {
      override async enqueue(tx: Tx, update: RelationshipUpdate): Promise<bigint> {
        await super.enqueue(tx, update);
        throw new Error('rollback after enqueue');
      }
    }
    const body = input();
    const response = await post(body, actor, new FailingOutbox());
    expect(response.status).toBe(500);
    expect(write).not.toHaveBeenCalled();
    const rows = await withPlatform(async (tx) => ({
      companies: await tx.query('SELECT id FROM company WHERE name = $1', [body.name]),
      members: await tx.query('SELECT company_id FROM company_member WHERE user_id = $1', [actor.id]),
      outbox: await tx.query('SELECT id FROM relationship_outbox WHERE subject_id = $1', [actor.id]),
    }));
    expect(rows).toEqual({ companies: [], members: [], outbox: [] });
  });

  it('requires authentication', async () => {
    const response = await post(input(), null);
    expect(response.status).toBe(401);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    { name: '' }, { name: 'x'.repeat(121) }, { defaultRegion: 'invalid' },
    { defaultIndustryId: 'not-a-uuid' }, { defaultIndustryId: randomUUID() },
  ])('rejects invalid company input %j', async (invalid) => {
    const response = await post({ ...input(), ...invalid });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_failed' } });
    expect(write).not.toHaveBeenCalled();
  });
});
