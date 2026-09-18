import { resetDatabaseBeforeEach } from './database-fixture.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { IndustryListResponse } from '../src/shared/api/tenancy-schemas.js';
import { industryRoutes } from '../src/modules/vocabulary/api/industry-routes.js';
import { ListIndustriesService } from '../src/modules/vocabulary/application/list-industries.js';
import { PostgresIndustryListRepository } from '../src/modules/vocabulary/infrastructure/industry-list-repository.js';
import { withPlatform, withPlatformAdmin } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { IndustryId, Timestamp, UserId } from '../src/shared/kernel/index.js';

const servers: ReturnType<typeof createHttpServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});
async function request(service: ListIndustriesService, authenticated = true) {
  const server = createHttpServer(industryRoutes(service), { authorization: { currentUser: async () => authenticated ? {
    id: UserId(randomUUID()), email: 'industry@example.com', fullName: null, timezone: 'UTC', method: 'magic_link',
    sessionCreatedAt: Timestamp(new Date()), deviceConfirmed: true,
  } : null } });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No address.');
  return fetch(`http://127.0.0.1:${address.port}/api/v1/industries`);
}

describe('GET /industries', () => {
  it('requires authentication without consulting the repository', async () => {
    let called = false;
    const response = await request(new ListIndustriesService({ list: async () => { called = true; return []; } }), false);
    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });
  it('returns a non-paginated list with descriptions, counts, and demo availability', async () => {
    const items = [{ id: IndustryId(randomUUID()), slug: 'test', name: 'Test', description: 'Industry description', inheritedTermCount: 4, hasDemoPack: true }];
    const response = await request(new ListIndustriesService({ list: async () => items }));
    expect(response.status).toBe(200);
    expect(IndustryListResponse.parse(await response.json())).toEqual(items);
  });
});

const databaseDescribe = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
databaseDescribe('industry listing with Postgres', () => {
  resetDatabaseBeforeEach('industry');
  it('reads in platform scope, counts active inherited terms and excludes inactive industries', async () => {
    const active = randomUUID();
    const inactive = randomUUID();
    await withPlatformAdmin({ actor: { kind: 'system', name: 'industry-list-test' } }, async (tx) => {
      await tx.query(`INSERT INTO industry (id, slug, name, active) VALUES ($1::uuid, $1::text, 'List active', true), ($2::uuid, $2::text, 'List inactive', false)`, [active, inactive]);
      await tx.query(`INSERT INTO vocabulary_term (scope, industry_id, kind, name, display_name, active)
        VALUES ('industry', $1, 'subject', 'one', 'One', true), ('industry', $1, 'subject', 'two', 'Two', false)`, [active]);
    });
    const response = await request(new ListIndustriesService(new PostgresIndustryListRepository()));
    expect(response.status).toBe(200);
    const items = IndustryListResponse.parse(await response.json());
    expect(items.find((item) => item.id === active)).toMatchObject({ inheritedTermCount: 1, description: null, hasDemoPack: false });
    expect(items.find((item) => item.id === inactive)).toBeUndefined();
    await expect(withPlatform((tx) => tx.query('SELECT id FROM demo_source_template LIMIT 1'))).resolves.toBeDefined();
  });
});
