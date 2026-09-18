import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { v1 } from '@authzed/authzed-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SpiceDbAuthorizationPort } from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import { ExplainPermissionsService, projectPermissions } from '../src/modules/tenancy/application/explain-permissions.js';
import { PostgresPermissionSubjectRepository } from '../src/modules/tenancy/infrastructure/permission-subject-repository.js';
import { permissionRoutes } from '../src/modules/tenancy/api/permission-routes.js';
import { ExplainResponse } from '../src/shared/api/tenancy-schemas.js';
import { CompanyId, ProjectId, UserId, TestClock } from '../src/shared/kernel/index.js';
import { withPlatform } from '../src/platform/db/scope.js';
import { createHttpServer, defineRoute } from '../src/platform/http/index.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';

const integration = (process.env.DATABASE_URL === undefined || process.env.SPICEDB_ENDPOINT === undefined) && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
integration('project permissions with Postgres and SpiceDB', () => {
  resetDatabaseBeforeEach('company', 'user_account');
  let port: SpiceDbAuthorizationPort;
  let sdk: ReturnType<typeof v1.NewClient>;
  let project: ProjectId;
  let company: CompanyId;
  let users: Record<'admin' | 'operator' | 'viewer' | 'inherited' | 'member' | 'outsider' | 'otherCompany', UserId>;
  let server: ReturnType<typeof createHttpServer>;
  let base: string;
  let actor: UserId | null;
  const clock = new TestClock(new Date('2026-01-01T00:00:00Z'));

  beforeEach(async () => {
    const endpoint = process.env.SPICEDB_ENDPOINT;
    const token = process.env.SPICEDB_TOKEN;
    if (!endpoint || !token) throw new Error('SpiceDB environment is required.');
    port = new SpiceDbAuthorizationPort({ endpoint, token, clock, stalenessCeilingMs: 0 });
    sdk = v1.NewClient(token, endpoint, v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
    await port.loadSchema(await readFile('docs/opintel-schema.zed', 'utf8'));
    project = ProjectId(randomUUID()); company = CompanyId(randomUUID());
    users = { admin: UserId(randomUUID()), operator: UserId(randomUUID()), viewer: UserId(randomUUID()), inherited: UserId(randomUUID()), member: UserId(randomUUID()), outsider: UserId(randomUUID()), otherCompany: UserId(randomUUID()) };
    const otherCompany = CompanyId(randomUUID());
    await withPlatform(async (tx) => {
      for (const [name, user] of Object.entries(users)) await tx.query('INSERT INTO user_account (id, email) VALUES ($1, $2)', [user, `${name}@example.com`]);
      await tx.query("INSERT INTO company (id, name, default_region) VALUES ($1, 'Here', 'eu-west-1'), ($2, 'Elsewhere', 'eu-west-1')", [company, otherCompany]);
      await tx.query("INSERT INTO project (id, company_id, industry_id, name, region) SELECT $1, $2, id, 'Permissions', 'eu-west-1' FROM industry LIMIT 1", [project, company]);
      for (const role of ['admin', 'operator', 'viewer'] as const) await tx.query('INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, $3)', [project, users[role], role]);
      await tx.query("INSERT INTO company_member (company_id, user_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member'), ($4, $5, 'admin')", [company, users.inherited, users.member, otherCompany, users.otherCompany]);
    });
    await port.write([
      { operation: 'touch', resource: { type: 'project', id: project }, relation: 'company', subject: { type: 'company', id: company } },
      ...(['admin', 'operator', 'viewer'] as const).map((role) => ({ operation: 'touch' as const, resource: { type: 'project' as const, id: project }, relation: role, subject: { type: 'user' as const, id: users[role] } })),
      { operation: 'touch', resource: { type: 'company', id: company }, relation: 'admin', subject: { type: 'user', id: users.inherited } },
      { operation: 'touch', resource: { type: 'company', id: company }, relation: 'member', subject: { type: 'user', id: users.member } },
      { operation: 'touch', resource: { type: 'company', id: otherCompany }, relation: 'admin', subject: { type: 'user', id: users.otherCompany } },
    ]);
    actor = users.viewer;
    // Test-only handlers exercise the production permission boundary for later endpoint groups.
    const probes = projectPermissions.map((permission) => defineRoute({
      method: 'GET', path: `/api/v1/projects/:id/probe/${permission}`,
      permission: { resource: 'project', id: (request) => request.params.id, permission },
      params: z.object({ id: z.string().uuid() }), request: z.undefined(), response: z.object({ ok: z.boolean() }),
      handle: async () => ({ status: 200, body: { ok: true } }),
    }));
    server = createHttpServer([...permissionRoutes(new ExplainPermissionsService(new PostgresPermissionSubjectRepository(), port)), ...probes], {
      authorization: { port, currentUser: async () => actor === null ? null : { id: actor, email: 'caller@example.com', fullName: null, timezone: 'UTC', method: 'magic_link', deviceConfirmed: true, sessionCreatedAt: clock.now() } },
      logger: { error: () => {} },
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No address.');
    base = `http://127.0.0.1:${address.port}/api/v1/projects/${project}`;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    port?.close(); sdk?.close(); vi.restoreAllMocks();
  });

  it('E-005: operator can operate but every widening permission is refused at the API', async () => {
    actor = users.operator;
    for (const permission of ['view', 'export_evidence', 'simulate', 'ack_observation']) expect((await fetch(`${base}/probe/${permission}`)).status).toBe(200);
    for (const permission of ['administer', 'set_entitlement', 'map_term', 'bind_source', 'view_unredacted', 'archive']) expect((await fetch(`${base}/probe/${permission}`)).status).toBe(403);
  });

  it('E-006: viewer cannot request unredacted arguments at the API', async () => {
    expect((await fetch(`${base}/probe/view_unredacted`)).status).toBe(403);
  });

  it.each(['outsider', 'otherCompany'] as const)('E-007/E-008: %s receives 404 for the project and its explanations', async (role) => {
    actor = users[role];
    expect((await fetch(`${base}/probe/view`)).status).toBe(404);
    expect((await fetch(`${base}/permissions/${users.admin}/explain`)).status).toBe(404);
  });

  it.each(['admin', 'operator', 'inherited', 'member', 'outsider'] as const)('E-009: %s verdicts and membership derivation work with dispatch caching enabled', async (role) => {
    const batch = vi.spyOn(port, 'checkMany');
    const response = await fetch(`${base}/permissions/${users[role]}/explain`);
    expect(response.status).toBe(200);
    const body = ExplainResponse.parse(await response.json());
    expect(body.user).toEqual({ id: users[role], email: `${role}@example.com` });
    expect(body.projectRole).toBe(role === 'admin' || role === 'operator' ? role : null);
    expect(body.companyRole).toBe(role === 'inherited' ? 'admin' : role === 'member' ? 'member' : null);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0].map((req) => req.permission)).toEqual(projectPermissions);
    expect(batch.mock.calls[0]?.[1]).toEqual({ withTracing: true });
    const checks = await batch.mock.results[0]?.value;
    expect(checks?.every((check: { token: string }) => check.token === body.token)).toBe(true);
    const rawBatch = await sdk.promises.checkBulkPermissions(v1.CheckBulkPermissionsRequest.create({
        consistency: { requirement: { oneofKind: 'atExactSnapshot', atExactSnapshot: { token: body.token } } },
        items: projectPermissions.map((permission) => ({
          resource: { objectType: 'project', objectId: project }, permission,
          subject: { object: { objectType: 'user', objectId: users[role] } },
        })), withTracing: true,
    }));
    expect(rawBatch.checkedAt?.token).toBe(body.token);
    for (const permission of body.permissions) {
      const pair = rawBatch.pairs.find((pair) => pair.request?.permission === permission.permission);
      if (pair?.response.oneofKind !== 'item') throw new Error('Missing raw check.');
      const raw = pair.response.item;
      expect(permission.allowed).toBe(raw.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION);
      const expectedAllowed = role === 'admin' || role === 'inherited' || (role === 'member' && permission.permission === 'view') || (role === 'operator' && ['view', 'export_evidence', 'simulate', 'ack_observation'].includes(permission.permission));
      expect(permission.allowed).toBe(expectedAllowed);
      expect(Array.isArray(permission.path)).toBe(true);
      expect(permission.via).toBe(!permission.allowed ? 'none' : role === 'inherited' ? 'company' : role === 'admin' || role === 'operator' ? 'project' : 'none');
    }
    const repeated = await fetch(`${base}/permissions/${users[role]}/explain`);
    expect(repeated.status).toBe(200);
    const repeatedBody = ExplainResponse.parse(await repeated.json());
    expect(repeatedBody.permissions.map(({ permission, allowed, via }) => ({ permission, allowed, via })))
      .toEqual(body.permissions.map(({ permission, allowed, via }) => ({ permission, allowed, via })));
    expect(repeatedBody.permissions.every((permission) => Array.isArray(permission.path))).toBe(true);
  });

  it('prefers the project membership when the user also administers the company', async () => {
    await withPlatform((tx) => tx.query(
      "INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, 'viewer')", [project, users.inherited],
    ));
    await port.write([{
      operation: 'touch', resource: { type: 'project', id: project }, relation: 'viewer',
      subject: { type: 'user', id: users.inherited },
    }]);
    const response = await fetch(`${base}/permissions/${users.inherited}/explain`);
    expect(response.status).toBe(200);
    const body = ExplainResponse.parse(await response.json());
    expect(body).toMatchObject({ projectRole: 'viewer', companyRole: 'admin' });
    expect(body.permissions.every((permission) => permission.allowed && permission.via === 'project')).toBe(true);
  });

  it.each(['empty', 'absent'] as const)('returns allowed permissions when supplementary traces are %s', async (trace) => {
    const checkMany = port.checkMany.bind(port);
    vi.spyOn(port, 'checkMany').mockImplementation(async (requests, options) => {
      const results = await checkMany(requests, options);
      return results.map(({ explanation: _explanation, ...result }) => ({
        ...result, ...(trace === 'empty' ? { explanation: { path: [] } } : {}),
      }));
    });
    const response = await fetch(`${base}/permissions/${users.inherited}/explain`);
    expect(response.status).toBe(200);
    const body = ExplainResponse.parse(await response.json());
    expect(body.permissions.every((permission) => permission.allowed && permission.via === 'company')).toBe(true);
    expect(body.permissions.every((permission) => Array.isArray(permission.path))).toBe(true);
  });

  it('requires authentication, validates ids, and returns 404 for a missing subject', async () => {
    expect((await fetch(`${base}/permissions/invalid/explain`)).status).toBe(400);
    expect((await fetch(`${base}/permissions/${randomUUID()}/explain`)).status).toBe(404);
    actor = null;
    expect((await fetch(`${base}/permissions/${users.admin}/explain`)).status).toBe(401);
  });

  it('fails closed when the bulk check is unavailable', async () => {
    vi.spyOn(port, 'checkMany').mockRejectedValue(new Error('SpiceDB unavailable'));
    const response = await fetch(`${base}/permissions/${users.admin}/explain`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'dependency_unavailable', retryable: true } });
  });
});
