import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationPort, ZedToken } from '../src/modules/authz/index.js';
import type { CurrentUser } from '../src/modules/identity/application/current-user.js';
import { ProjectView, UpdateProjectBody, projectUpdateRoutes } from '../src/modules/tenancy/api/project-routes.js';
import { UpdateProjectService } from '../src/modules/tenancy/application/update-project.js';
import { PostgresProjectUpdateRepository } from '../src/modules/tenancy/infrastructure/project-update-repository.js';
import { withPlatform } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { Timestamp, UserId } from '../src/shared/kernel/index.js';

const databaseDescribe = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
const servers: ReturnType<typeof createHttpServer>[] = [];
const token = 'project-update-token' as ZedToken;
const check = vi.fn<AuthorizationPort['check']>();
const write = vi.fn<AuthorizationPort['write']>();
const unexpectedCall = async (): Promise<never> => { throw new Error('Unexpected authorization call.'); };
const authorization: AuthorizationPort = { check, write, checkMany: unexpectedCall, explain: unexpectedCall };
const actor: CurrentUser = {
  id: UserId(randomUUID()), email: 'rename@example.com', fullName: null, timezone: 'UTC',
  method: 'magic_link', sessionCreatedAt: Timestamp(new Date()), deviceConfirmed: true,
};
let projectId: string;
let companyId: string;
let industryId: string;

async function patch(body: unknown, id = projectId, user: CurrentUser | null = actor) {
  const server = createHttpServer(projectUpdateRoutes(new UpdateProjectService(new PostgresProjectUpdateRepository())), {
    authorization: { currentUser: async () => user, port: authorization }, logger: { error: () => {} },
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No server address.');
  return fetch(`http://127.0.0.1:${address.port}/api/v1/projects/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function storedProject() {
  return withPlatform((tx) => tx.query('SELECT * FROM project WHERE id = $1', [projectId]));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

databaseDescribe('PATCH /projects/:id with Postgres', () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required.');
    projectId = randomUUID();
    companyId = randomUUID();
    await withPlatform(async (tx) => {
      const industries = await tx.query<{ id: string }>('SELECT id FROM industry ORDER BY id LIMIT 1');
      const industry = industries[0];
      if (industry === undefined) throw new Error('Seed industry is missing.');
      industryId = industry.id;
      await tx.query("INSERT INTO company (id, name, default_region) VALUES ($1, 'Rename test', 'eu-west-1')", [companyId]);
      await tx.query(
        `INSERT INTO project (id, company_id, industry_id, name, region, settings)
         VALUES ($1, $2, $3, 'Original', 'ap-southeast-3', '{"preserve":true}')`,
        [projectId, companyId, industryId],
      );
    });
    check.mockReset().mockResolvedValue({ allowed: true, token, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0 });
    write.mockReset();
  });

  it('Q-007, Q-008: renames only, returns ProjectView, and ignores non-contract fields', async () => {
    const before = await storedProject();
    expect(Object.keys(UpdateProjectBody.shape)).toEqual(['name']);
    const response = await patch({ name: 'Renamed', region: 'us-east-1', industryId: randomUUID(), companyId: randomUUID(), settings: {} });
    expect(response.status).toBe(200);
    const project = ProjectView.parse(await response.json());
    expect(project).toMatchObject({ id: projectId, companyId, name: 'Renamed', region: 'ap-southeast-3', industry: { id: industryId } });
    expect(await storedProject()).toEqual(before.map((row) => ({ ...(row as Record<string, unknown>), name: 'Renamed' })));
    expect(check.mock.calls.map(([request]) => request)).toEqual(['view', 'administer'].map((permission) => ({
      resource: { type: 'project', id: projectId }, permission, subject: { type: 'user', id: actor.id },
    })));
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects a visible project the caller cannot administer', async () => {
    check.mockImplementation(async (request) => ({ allowed: request.permission === 'view', token, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0 }));
    const before = await storedProject();
    expect((await patch({ name: 'Denied' })).status).toBe(403);
    expect(await storedProject()).toEqual(before);
  });

  it('returns 404 for a hidden project and 401 without authentication', async () => {
    check.mockResolvedValue({ allowed: false, token, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0 });
    const before = await storedProject();
    expect((await patch({ name: 'Denied' })).status).toBe(404);
    expect((await patch({ name: 'Denied' }, projectId, null)).status).toBe(401);
    expect(await storedProject()).toEqual(before);
  });

  it('returns 404 when the project no longer exists', async () => {
    const response = await patch({ name: 'Missing' }, randomUUID());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('E2-008: returns 409 and rolls back a duplicate name in the same company', async () => {
    await withPlatform((tx) => tx.query(
      "INSERT INTO project (company_id, industry_id, name, region) VALUES ($1, $2, 'Taken', 'eu-west-1')", [companyId, industryId],
    ));
    const before = await storedProject();
    const response = await patch({ name: 'TAKEN' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'conflict' } });
    expect(await storedProject()).toEqual(before);
  });

  it('allows an unchanged name and a name used in another company', async () => {
    expect((await patch({ name: 'Original' })).status).toBe(200);
    const otherCompanyId = randomUUID();
    await withPlatform(async (tx) => {
      await tx.query("INSERT INTO company (id, name, default_region) VALUES ($1, 'Other', 'eu-west-1')", [otherCompanyId]);
      await tx.query("INSERT INTO project (company_id, industry_id, name, region) VALUES ($1, $2, 'Elsewhere', 'eu-west-1')", [otherCompanyId, industryId]);
    });
    expect((await patch({ name: 'Elsewhere' })).status).toBe(200);
  });

  it.each([{}, { name: '' }, { name: 'x'.repeat(81) }, { name: null }, { region: 'us-east-1' }, { industryId: randomUUID() }])('rejects invalid input %j without changes', async (body) => {
    const before = await storedProject();
    const response = await patch(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_failed' } });
    expect(await storedProject()).toEqual(before);
    expect(check).not.toHaveBeenCalled();
  });

  it('validates the project id before authorization', async () => {
    expect((await patch({ name: 'Valid' }, 'not-a-uuid')).status).toBe(400);
    expect(check).not.toHaveBeenCalled();
  });
});
