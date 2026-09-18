import { resetDatabaseBeforeEach } from './database-fixture.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationPort, RelationshipUpdate, ZedToken } from '../src/modules/authz/index.js';
import type { CurrentUser } from '../src/modules/identity/application/current-user.js';
import { ProjectView, projectRoutes } from '../src/modules/tenancy/api/project-routes.js';
import { CreateProjectService } from '../src/modules/tenancy/application/create-project.js';
import { RelationshipOutbox } from '../src/modules/tenancy/index.js';
import { PostgresProjectCreationRepository } from '../src/modules/tenancy/infrastructure/project-creation-repository.js';
import { withPlatform, withPlatformAdmin, type Tx } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { Timestamp, UserId } from '../src/shared/kernel/index.js';

const databaseDescribe = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
const servers: ReturnType<typeof createHttpServer>[] = [];
const token = 'project-create-token' as ZedToken;
const write = vi.fn<AuthorizationPort['write']>();
const check = vi.fn<AuthorizationPort['check']>();
const unexpectedCall = async (): Promise<never> => { throw new Error('Unexpected authorization call.'); };
const authorization: AuthorizationPort = { write, check, checkMany: unexpectedCall, explain: unexpectedCall };
let actor: CurrentUser;
let companyId: string;
let industryId: string;

function input() {
  return { companyId, industryId, name: `Project ${randomUUID()}`, region: 'ap-southeast-3' };
}

async function post(body: unknown, user: CurrentUser | null = actor, outbox = new RelationshipOutbox()) {
  const service = new CreateProjectService(new PostgresProjectCreationRepository(outbox), outbox, authorization);
  const server = createHttpServer(projectRoutes(service), {
    authorization: { currentUser: async () => user, port: authorization }, logger: { error: () => {} },
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No server address.');
  return fetch(`http://127.0.0.1:${address.port}/api/v1/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function projectRows() {
  return withPlatform((tx) => tx.query('SELECT id FROM project WHERE company_id = $1', [companyId]));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

databaseDescribe('POST /projects with Postgres', () => {
  resetDatabaseBeforeEach('industry', 'company', 'user_account', 'relationship_outbox');
  beforeEach(async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required.');
    actor = {
      id: UserId(randomUUID()), email: `${randomUUID()}@example.com`, fullName: null, timezone: 'UTC',
      method: 'magic_link', sessionCreatedAt: Timestamp(new Date()), deviceConfirmed: true,
    };
    companyId = randomUUID();
    industryId = randomUUID();
    await withPlatform(async (tx) => {
      await tx.query('INSERT INTO user_account (id, email) VALUES ($1, $2)', [actor.id, actor.email]);
      await tx.query("INSERT INTO company (id, name, default_region) VALUES ($1, 'Project test company', 'eu-west-1')", [companyId]);
    });
    await withPlatformAdmin({ actor: { kind: 'system', name: 'project-route-test' } }, async (tx) => {
      await tx.query("INSERT INTO industry (id, slug, name) VALUES ($1, $2, 'Test industry')", [industryId, `test-${industryId}`]);
      await tx.query(
        `INSERT INTO vocabulary_term (scope, industry_id, kind, name, display_name, active)
         VALUES ('industry', $1, 'subject', 'active_term', 'Active', true),
                ('industry', $1, 'subject', 'inactive_term', 'Inactive', false)`, [industryId],
      );
    });
    write.mockReset().mockResolvedValue(token);
    check.mockReset().mockResolvedValue({ allowed: true, token, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0 });
  });

  it('E2-010, E2-011, E2-018: commits both relationships and membership, uses the supplied region, and inherits by reference', async () => {
    const body = input();
    write.mockImplementation(async (updates) => {
      const update = updates[0];
      if (update === undefined) throw new Error('Missing relationship.');
      const rows = await withPlatform((tx) => tx.query(
        `SELECT m.role, o.relation FROM project p
         JOIN project_member m ON m.project_id = p.id
         JOIN relationship_outbox o ON o.resource_id = p.id::text
         WHERE p.id = $1 AND m.user_id = $2 ORDER BY o.relation`, [update.resource.id, actor.id],
      ));
      expect(rows).toEqual([{ role: 'admin', relation: 'admin' }, { role: 'admin', relation: 'company' }]);
      return token;
    });
    const response = await post(body);
    expect(response.status).toBe(201);
    const project = ProjectView.parse(await response.json());
    expect(project).toMatchObject({ companyId, name: body.name, region: body.region,
      industry: { id: industryId, name: 'Test industry', inheritedTermCount: 1 } });
    expect(check.mock.calls.map(([request]) => request)).toEqual(['view', 'administer'].map((permission) => ({
      resource: { type: 'company', id: companyId }, permission, subject: { type: 'user', id: actor.id },
    })));
    expect(write.mock.calls).toEqual([
      [[{ operation: 'touch', resource: { type: 'project', id: project.id }, relation: 'company', subject: { type: 'company', id: companyId } }]],
      [[{ operation: 'touch', resource: { type: 'project', id: project.id }, relation: 'admin', subject: { type: 'user', id: actor.id } }]],
    ]);
    const records = await withPlatform(async (tx) => ({
      outbox: await tx.query('SELECT zed_token, written_at FROM relationship_outbox WHERE resource_id = $1', [project.id]),
      vocabulary: await tx.query('SELECT scope FROM vocabulary_term WHERE industry_id = $1 OR project_id = $2', [industryId, project.id]),
      project: await tx.query('SELECT industry_id, region FROM project WHERE id = $1', [project.id]),
    }));
    expect(records.outbox).toEqual(Array.from({ length: 2 }, () => ({ zed_token: token, written_at: expect.any(Date) })));
    expect(records.vocabulary).toEqual([{ scope: 'industry' }, { scope: 'industry' }]);
    expect(records.project).toEqual([{ industry_id: industryId, region: body.region }]);
  });

  it('E2-004: refuses a visible company the caller cannot administer without writing', async () => {
    check.mockImplementation(async (request) => ({ allowed: request.permission === 'view', token, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0 }));
    expect((await post(input())).status).toBe(403);
    expect(await projectRows()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('hides an inaccessible company and refuses unauthenticated callers', async () => {
    check.mockResolvedValue({ allowed: false, token, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0 });
    expect((await post(input())).status).toBe(404);
    expect((await post(input(), null)).status).toBe(401);
    expect(await projectRows()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('E2-008: rejects case-insensitive duplicate names in a company, including concurrent creates', async () => {
    const body = input();
    const responses = await Promise.all([post(body), post({ ...body, name: body.name.toUpperCase() })]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await projectRows()).toHaveLength(1);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('E2-009: permits the same name in different companies', async () => {
    const otherCompanyId = randomUUID();
    await withPlatform((tx) => tx.query("INSERT INTO company (id, name, default_region) VALUES ($1, 'Other', 'eu-west-1')", [otherCompanyId]));
    const body = input();
    expect((await post(body)).status).toBe(201);
    expect((await post({ ...body, companyId: otherCompanyId })).status).toBe(201);
    expect(check).toHaveBeenCalledWith({ resource: { type: 'company', id: otherCompanyId }, permission: 'administer', subject: { type: 'user', id: actor.id } });
  });

  it.each(['company', 'admin'])('retains the %s relationship for retry when dispatch fails', async (failedRelation) => {
    write.mockImplementation(async (updates) => {
      if (updates[0]?.relation === failedRelation) throw new Error('SpiceDB unavailable');
      return token;
    });
    const response = await post(input());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'dependency_unavailable', retryable: true } });
    const rows = await withPlatform((tx) => tx.query<{ relation: string; written_at: Date | null; zed_token: string | null; attempts: number }>(
      `SELECT o.relation, o.written_at, o.zed_token, o.attempts FROM relationship_outbox o
       JOIN project p ON p.id::text = o.resource_id WHERE p.company_id = $1`, [companyId],
    ));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.relation === failedRelation)).toEqual({ relation: failedRelation, written_at: null, zed_token: null, attempts: 1 });
    expect(rows.find((row) => row.relation !== failedRelation)?.written_at).toBeInstanceOf(Date);
  });

  it('rolls back project, membership and both outbox entries on an enqueue failure', async () => {
    class FailingOutbox extends RelationshipOutbox {
      override async enqueue(tx: Tx, update: RelationshipUpdate): Promise<bigint> {
        const id = await super.enqueue(tx, update);
        if (update.relation === 'admin') throw new Error('rollback second enqueue');
        return id;
      }
    }
    expect((await post(input(), actor, new FailingOutbox())).status).toBe(500);
    const rows = await withPlatform(async (tx) => ({
      projects: await tx.query('SELECT id FROM project WHERE company_id = $1', [companyId]),
      members: await tx.query('SELECT project_id FROM project_member WHERE user_id = $1', [actor.id]),
      outbox: await tx.query('SELECT id FROM relationship_outbox WHERE subject_id IN ($1, $2)', [actor.id, companyId]),
    }));
    expect(rows).toEqual({ projects: [], members: [], outbox: [] });
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    { industryId: undefined }, { industryId: null }, { industryId: randomUUID() },
    { region: undefined }, { region: 'invalid' }, { name: '' }, { name: 'x'.repeat(81) },
  ])('E2-006: rejects invalid input %j', async (invalid) => {
    const response = await post({ ...input(), ...invalid });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_failed' } });
    expect(await projectRows()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });
});
