import { resetDatabaseBeforeEach } from './database-fixture.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationPort, ZedToken } from '../src/modules/authz/index.js';
import type { CurrentUser } from '../src/modules/identity/application/current-user.js';
import { CompanyListResponse, ProjectListResponse, tenancyListRoutes } from '../src/modules/tenancy/api/list-routes.js';
import { TenancyListService } from '../src/modules/tenancy/application/list-tenancy.js';
import { PostgresTenancyListRepository } from '../src/modules/tenancy/infrastructure/tenancy-list-repository.js';
import { withPlatform } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { Timestamp, UserId } from '../src/shared/kernel/index.js';

const databaseDescribe = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
const servers: ReturnType<typeof createHttpServer>[] = [];
const checkMany = vi.fn<AuthorizationPort['checkMany']>();
const unexpectedCall = async (): Promise<never> => { throw new Error('Unexpected authorization call.'); };
const authorization: AuthorizationPort = { checkMany, check: unexpectedCall, write: unexpectedCall, explain: unexpectedCall };
const permissions = new Map<string, Set<string>>();
let actor: CurrentUser;
let industryId: string;
let industryName: string;

function allow(kind: 'company' | 'project', id: string, role: 'admin' | 'operator' | 'viewer' | 'member') {
  permissions.set(`${kind}:${id}`, new Set(['view', ...(role === 'admin' ? ['administer', 'simulate'] : role === 'operator' ? ['simulate'] : [])]));
}

async function company(role: 'admin' | 'member' | null = 'member') {
  const id = randomUUID();
  await withPlatform(async (tx) => {
    await tx.query("INSERT INTO company (id, name, default_region) VALUES ($1, $2, 'eu-west-1')", [id, `Company ${id}`]);
    if (role !== null) await tx.query('INSERT INTO company_member (company_id, user_id, role) VALUES ($1, $2, $3)', [id, actor.id, role]);
  });
  if (role !== null) allow('company', id, role);
  return id;
}

async function project(companyId: string, role: 'admin' | 'operator' | 'viewer' | null, archived = false) {
  const id = randomUUID();
  await withPlatform(async (tx) => {
    await tx.query(
      `INSERT INTO project (id, company_id, industry_id, name, region, archived_at)
       VALUES ($1, $2, $3, $4, 'us-east-1', $5)`, [id, companyId, industryId, `Project ${id}`, archived ? new Date() : null],
    );
    if (role !== null) await tx.query('INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, $3)', [id, actor.id, role]);
  });
  if (role !== null) allow('project', id, role);
  return id;
}

async function get(path: string, user: CurrentUser | null = actor) {
  const server = createHttpServer(tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(), authorization)), {
    authorization: { currentUser: async () => user }, logger: { error: () => {} },
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No server address.');
  return fetch(`http://127.0.0.1:${address.port}/api/v1/${path}`);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

databaseDescribe('tenancy lists with Postgres', () => {
  resetDatabaseBeforeEach('company', 'user_account');
  beforeEach(async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required.');
    actor = { id: UserId(randomUUID()), email: `${randomUUID()}@example.com`, fullName: null,
      timezone: 'UTC', method: 'magic_link', sessionCreatedAt: Timestamp(new Date()), deviceConfirmed: true };
    await withPlatform(async (tx) => {
      await tx.query('INSERT INTO user_account (id, email) VALUES ($1, $2)', [actor.id, actor.email]);
      const [industry] = await tx.query<{ id: string; name: string }>('SELECT id, name FROM industry ORDER BY id LIMIT 1');
      if (industry === undefined) throw new Error('Seed industry missing.');
      industryId = industry.id;
      industryName = industry.name;
    });
    permissions.clear();
    checkMany.mockReset().mockImplementation(async (requests) => requests.map((request) => ({
      allowed: request.subject.id === actor.id && (permissions.get(`${request.resource.type}:${request.resource.id}`)?.has(request.permission) ?? false),
      token: 'list-token' as ZedToken, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0,
    })));
  });

  it('returns company, industry and effective roles, including inherited company access', async () => {
    const companyId = await company('admin');
    const inherited = await project(companyId, null);
    allow('project', inherited, 'admin');
    const directCompany = await company(null);
    const operator = await project(directCompany, 'operator');
    const viewer = await project(directCompany, 'viewer');
    const overlapping = await project(companyId, 'viewer');
    allow('project', overlapping, 'admin');
    const denied = await project(companyId, 'admin');
    permissions.delete(`project:${denied}`);
    const response = await get('projects');
    expect(response.status).toBe(200);
    const page = ProjectListResponse.parse(await response.json());
    expect(page.items.map((item) => [item.id, item.role]).sort()).toEqual([
      [inherited, 'admin'], [operator, 'operator'], [viewer, 'viewer'], [overlapping, 'admin'],
    ].sort());
    expect(page.items.find((item) => item.id === inherited)).toEqual({
      id: inherited, name: `Project ${inherited}`, region: 'us-east-1', role: 'admin',
      company: { id: companyId, name: `Company ${companyId}` }, industry: { id: industryId, name: industryName },
    });
    expect(page.nextCursor).toBeNull();
  });

  it('excludes archives by default and includes archivedAt when requested', async () => {
    const companyId = await company();
    const active = await project(companyId, 'viewer');
    const archived = await project(companyId, 'viewer', true);
    const normal = ProjectListResponse.parse(await (await get('projects')).json());
    expect(normal.items.map((item) => item.id)).toEqual([active]);
    const all = ProjectListResponse.parse(await (await get('projects?includeArchived=true')).json());
    expect(all.items).toHaveLength(2);
    expect(all.items.find((item) => item.id === active)?.archivedAt).toBeNull();
    expect(all.items.find((item) => item.id === archived)?.archivedAt).toEqual(expect.any(String));
  });

  it('counts only reachable projects and includes companies reached through direct project membership', async () => {
    const companyId = await company(null);
    await project(companyId, 'operator');
    await project(companyId, 'operator', true);
    const stale = await project(companyId, 'operator');
    permissions.delete(`project:${stale}`);
    await project(companyId, null);
    const hidden = await company();
    permissions.delete(`company:${hidden}`);
    const adminCompany = await company('admin');
    const inherited = await project(adminCompany, null);
    allow('project', inherited, 'admin');
    const response = await get('companies');
    expect(response.status).toBe(200);
    const page = CompanyListResponse.parse(await response.json());
    expect(page.items).toHaveLength(2);
    expect(page.items).toEqual(expect.arrayContaining([
      { id: companyId, name: `Company ${companyId}`, role: 'member', projectCount: 2 },
      { id: adminCompany, name: `Company ${adminCompany}`, role: 'admin', projectCount: 1 },
    ]));
  });

  it.each(['projects', 'companies'])('paginates %s without duplicates and reapplies authorization', async (kind) => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const companyId = await company();
      ids.push(kind === 'companies' ? companyId : await project(companyId, 'viewer'));
    }
    ids.sort();
    const schema = kind === 'companies' ? CompanyListResponse : ProjectListResponse;
    const first = schema.parse(await (await get(`${kind}?limit=2`)).json());
    expect(first.items.map((item) => item.id)).toEqual(ids.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    permissions.delete(`${kind === 'companies' ? 'company' : 'project'}:${ids[2]}`);
    const second = schema.parse(await (await get(`${kind}?limit=2&cursor=${first.nextCursor}`)).json());
    expect(second.items.map((item) => item.id)).toEqual(ids.slice(3));
    expect(second.nextCursor).toBeNull();
  });

  it('continues through a full batch of denied project candidates without returning a misleading empty page', async () => {
    const companyId = await company();
    const ids = Array.from({ length: 103 }, () => randomUUID()).sort();
    await withPlatform((tx) => tx.query(
      `INSERT INTO project (id, company_id, industry_id, name, region)
       SELECT id, $2, $3, id::text, 'eu-west-1' FROM unnest($1::uuid[]) AS id`, [ids, companyId, industryId],
    ));
    for (const id of ids.slice(100)) allow('project', id, 'viewer');
    const first = ProjectListResponse.parse(await (await get('projects?limit=2')).json());
    expect(first.items.map((item) => item.id)).toEqual(ids.slice(100, 102));
    const second = ProjectListResponse.parse(await (await get(`projects?limit=2&cursor=${first.nextCursor}`)).json());
    expect(second.items.map((item) => item.id)).toEqual(ids.slice(102));
    expect(second.nextCursor).toBeNull();
  });

  it.each(['projects', 'companies'])('returns an empty %s list and clamps large limits with a warning', async (kind) => {
    const response = await get(`${kind}?limit=501`);
    expect(response.status).toBe(200);
    expect(response.headers.get('warning')).toContain('500');
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(checkMany).not.toHaveBeenCalled();
    expect((await get(kind, null)).status).toBe(401);
  });

  it.each(['projects?cursor=bad', 'companies?cursor=bad', 'projects?limit=0', 'companies?limit=-1', 'projects?includeArchived=maybe'])('rejects invalid pagination %s', async (path) => {
    const response = await get(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('rejects a cursor reused for another list or archive filter', async () => {
    const companyId = await company();
    await project(companyId, 'viewer');
    await project(companyId, 'viewer');
    const page = ProjectListResponse.parse(await (await get('projects?limit=1')).json());
    expect((await get(`companies?cursor=${page.nextCursor}`)).status).toBe(400);
    expect((await get(`projects?includeArchived=true&cursor=${page.nextCursor}`)).status).toBe(400);
  });

  it.each(['projects', 'companies'])('fails closed for %s when authorization fails or omits results', async (kind) => {
    const companyId = await company();
    await project(companyId, 'viewer');
    checkMany.mockRejectedValueOnce(new Error('unavailable'));
    const failed = await get(kind);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ error: { code: 'dependency_unavailable', retryable: true } });
    checkMany.mockResolvedValueOnce([]);
    expect((await get(kind)).status).toBe(503);
  });
});
