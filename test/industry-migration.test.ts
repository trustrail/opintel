import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import * as scopes from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import type { AuthorizationPort, ZedToken } from '../src/modules/authz/index.js';
import type { CurrentUser } from '../src/modules/identity/application/current-user.js';
import { MigrateIndustryService } from '../src/modules/tenancy/application/migrate-industry.js';
import { PostgresIndustryMigrationRepository } from '../src/modules/tenancy/infrastructure/industry-migration-repository.js';
import { industryMigrationRoutes } from '../src/modules/tenancy/api/industry-migration-routes.js';
import { MigrateIndustryPreview, ProjectView } from '../src/shared/api/tenancy-schemas.js';
import { ProjectId, Timestamp, UserId } from '../src/shared/kernel/index.js';

const integration = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
const actor: CurrentUser = {
  id: UserId(randomUUID()), email: 'migration@example.com', fullName: null, timezone: 'UTC',
  method: 'magic_link', sessionCreatedAt: Timestamp(new Date()), deviceConfirmed: true,
};
const project = randomUUID();
const sibling = randomUUID();
const company = randomUUID();
const oldIndustry = randomUUID();
const newIndustry = randomUUID();
const checked = (allowed = true) => ({ allowed, token: 'migration-test' as ZedToken, checkedAt: Timestamp(new Date()), snapshotAgeMs: 0 });
const check = vi.fn<AuthorizationPort['check']>();
const checkMany = vi.fn<AuthorizationPort['checkMany']>();
const unexpected = async (): Promise<never> => { throw new Error('Unexpected authorization write or trace.'); };
const authorization: AuthorizationPort = { check, checkMany, write: unexpected, explain: unexpected };
const servers: ReturnType<typeof createHttpServer>[] = [];

async function post(body: unknown = { industryId: newIndustry, confirmation: 'Migration project' }, query = '', user: CurrentUser | null = actor) {
  const service = new MigrateIndustryService(new PostgresIndustryMigrationRepository(), authorization);
  const server = createHttpServer(industryMigrationRoutes(service), {
    authorization: { currentUser: async () => user, port: authorization }, logger: { error: () => {} },
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No HTTP address.');
  return fetch(`http://127.0.0.1:${address.port}/api/v1/projects/${project}/migrate-industry${query}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
const snapshot = () => scopes.withPlatform((tx) => tx.query('SELECT * FROM project ORDER BY id'));

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

integration('industry migration with Postgres', () => {
  resetDatabaseBeforeEach('industry', 'company');
  beforeEach(async () => {
    await scopes.withPlatformAdmin({ actor: { kind: 'system', name: 'migration-fixtures' } }, async (tx) => {
      await tx.query(`INSERT INTO industry (id, slug, name, vocabulary_version) VALUES
        ($1, 'migration-old', 'Old industry', 3), ($2, 'migration-new', 'New industry', 8)`, [oldIndustry, newIndustry]);
      await tx.query(`INSERT INTO company (id, name, default_region) VALUES ($1, 'Migration company', 'eu-west-1')`, [company]);
      await tx.query(`INSERT INTO project (id, company_id, industry_id, name, region, settings) VALUES
        ($1, $3, $4, 'Migration project', 'eu-west-1', '{"preserve":true}'),
        ($2, $3, $4, 'Sibling', 'eu-west-1', '{}')`, [project, sibling, company, oldIndustry]);
      await tx.query(`INSERT INTO vocabulary_term (scope, industry_id, kind, name, display_name) VALUES
        ('industry', $1, 'subject', 'old-only', 'Old only'),
        ('industry', $2, 'subject', 'revenue', 'Revenue'),
        ('industry', $2, 'parameter', 'region', 'Region')`, [oldIndustry, newIndustry]);
    });
    check.mockReset().mockResolvedValue(checked());
    checkMany.mockReset().mockResolvedValue([checked(), checked()]);
  });

  it.each(['', '?dryRun=true'])('E2-023: requires company administration as well as project administration (%s)', async (query) => {
    checkMany.mockResolvedValue([checked(), checked(false)]);
    const before = await snapshot();
    expect((await post(undefined, query)).status).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect(checkMany).toHaveBeenCalledWith([
      { resource: { type: 'project', id: project }, permission: 'administer', subject: { type: 'user', id: actor.id } },
      { resource: { type: 'company', id: company }, permission: 'administer', subject: { type: 'user', id: actor.id } },
    ]);
  });

  it('requires project administration and hides projects from non-viewers', async () => {
    check.mockImplementation(async (request) => checked(request.permission === 'view'));
    expect((await post()).status).toBe(403);
    expect(checkMany).not.toHaveBeenCalled();
    check.mockResolvedValue(checked(false));
    expect((await post()).status).toBe(404);
    expect((await post(undefined, '', null)).status).toBe(401);
  });

  it('E2-024: previews without writing and ignores the confirmation value', async () => {
    const before = await snapshot();
    const response = await post({ industryId: newIndustry, confirmation: '' }, '?dryRun=true');
    expect(response.status).toBe(200);
    expect(MigrateIndustryPreview.parse(await response.json())).toEqual({
      from: { id: oldIndustry, name: 'Old industry', termCount: 1 },
      to: { id: newIndustry, name: 'New industry', termCount: 2 },
      shadowedTerms: [], projectTermsRetained: 0, entitlementsAffected: 0,
      confirmationPhrase: 'Migration project',
    });
    expect(await snapshot()).toEqual(before);
  });

  it.each([undefined, '', 'migration project', 'Migration project '])('E2-025: rejects absent or non-exact confirmation %j', async (confirmation) => {
    const before = await snapshot();
    expect((await post({ industryId: newIndustry, confirmation })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it('E2-034: changes only industry and one project revision, preserving the sibling cache version', async () => {
    const before = await snapshot();
    const response = await post();
    expect(response.status).toBe(200);
    expect(ProjectView.parse(await response.json())).toMatchObject({
      id: project, companyId: company, name: 'Migration project', region: 'eu-west-1',
      industry: { id: newIndustry, name: 'New industry', inheritedTermCount: 2 },
    });
    expect(await snapshot()).toEqual(before.map((row) => {
      const value = row as Record<string, unknown>;
      return value.id === project ? { ...value, industry_id: newIndustry, vocabulary_revision: 2 } : value;
    }));
    const versions = await scopes.withPlatform((tx) => tx.query<{ id: string; version: number }>(
      'SELECT p.id, i.vocabulary_version + p.vocabulary_revision AS version FROM project p JOIN industry i ON i.id = p.industry_id ORDER BY p.id',
    ));
    expect(versions.find((row) => row.id === project)?.version).toBe(10);
    expect(versions.find((row) => row.id === sibling)?.version).toBe(4);
  });

  it('E2-028: retains project terms row by row and reports their overrides in the new industry', async () => {
    const context = { userId: actor.id, projectId: ProjectId(project) };
    await scopes.withTenant(context, (tx) => tx.query(`
      INSERT INTO vocabulary_term (scope, project_id, kind, name, display_name, active) VALUES
      ('project', $1, 'subject', 'REVENUE', 'Project revenue', true),
      ('project', $1, 'operation', 'region', 'Different kind', true),
      ('project', $1, 'parameter', 'region', 'Inactive override', false)`, [project]));
    const terms = () => scopes.withTenant(context, (tx) => tx.query(
      "SELECT * FROM vocabulary_term WHERE project_id = $1 ORDER BY id", [project],
    ));
    const before = await terms();
    const preview = MigrateIndustryPreview.parse(await (await post(undefined, '?dryRun=true')).json());
    expect(preview.projectTermsRetained).toBe(3);
    expect(preview.shadowedTerms).toEqual([{ name: 'REVENUE', kind: 'subject' }]);
    expect((await post()).status).toBe(200);
    expect(await terms()).toEqual(before);
    // The project override and its inherited counterpart both survive. The
    // active same-kind/name project row is still the override after migration.
    const overrides = await scopes.withTenant(context, (tx) => tx.query<{ display_name: string }>(`
      SELECT p.display_name FROM vocabulary_term p JOIN vocabulary_term i
      ON p.kind = i.kind AND lower(p.name) = lower(i.name)
      WHERE p.project_id = $1 AND p.active AND i.industry_id = $2 AND i.active`, [project, newIndustry]));
    expect(overrides).toEqual([{ display_name: 'Project revenue' }]);
    expect(MigrateIndustryPreview.parse(await (await post(undefined, '?dryRun=true')).json()).shadowedTerms)
      .toEqual(preview.shadowedTerms);
  });

  it('tenant vocabulary writes enforce own-project scope and the scope_target constraint', async () => {
    const context = { userId: actor.id, projectId: ProjectId(project) };
    const own = randomUUID();
    const other = randomUUID();
    await scopes.withTenant(context, (tx) => tx.query(`INSERT INTO vocabulary_term
      (id, scope, project_id, kind, name, display_name) VALUES ($1, 'project', $2, 'subject', 'own', 'Own')`, [own, project]));
    await scopes.withTenant({ ...context, projectId: ProjectId(sibling) }, (tx) => tx.query(`INSERT INTO vocabulary_term
      (id, scope, project_id, kind, name, display_name) VALUES ($1, 'project', $2, 'subject', 'other', 'Other')`, [other, sibling]));
    await expect(scopes.withTenant(context, (tx) => tx.query(`INSERT INTO vocabulary_term
      (scope, project_id, kind, name, display_name) VALUES ('project', $1, 'subject', 'denied', 'Denied')`, [sibling])))
      .rejects.toMatchObject({ code: '42501' });
    await expect(scopes.withTenant(context, (tx) => tx.query(`INSERT INTO vocabulary_term
      (scope, industry_id, kind, name, display_name) VALUES ('industry', $1, 'subject', 'denied', 'Denied')`, [oldIndustry])))
      .rejects.toMatchObject({ code: '42501' });
    await expect(scopes.withTenant(context, (tx) => tx.query(`INSERT INTO vocabulary_term
      (scope, project_id, industry_id, kind, name, display_name) VALUES ('project', $1, $2, 'subject', 'invalid', 'Invalid')`, [project, oldIndustry])))
      .rejects.toMatchObject({ code: '23514', constraint: 'scope_target' });
    await scopes.withTenant(context, async (tx) => {
      expect(await tx.query("UPDATE vocabulary_term SET display_name = 'Edited' WHERE id = $1 RETURNING id", [own])).toHaveLength(1);
      expect(await tx.query("UPDATE vocabulary_term SET display_name = 'Denied' WHERE id = $1 RETURNING id", [other])).toEqual([]);
      expect(await tx.query('DELETE FROM vocabulary_term WHERE id = $1 RETURNING id', [other])).toEqual([]);
      expect(await tx.query('DELETE FROM vocabulary_term WHERE id = $1 RETURNING id', [own])).toHaveLength(1);
    });
  });

  it('synonym writes inherit parent scope, including protection against reparenting', async () => {
    const context = { userId: actor.id, projectId: ProjectId(project) };
    const own = randomUUID();
    const other = randomUUID();
    await scopes.withTenant(context, (tx) => tx.query(`INSERT INTO vocabulary_term
      (id, scope, project_id, kind, name, display_name) VALUES ($1, 'project', $2, 'subject', 'own', 'Own')`, [own, project]));
    await scopes.withTenant({ ...context, projectId: ProjectId(sibling) }, (tx) => tx.query(`INSERT INTO vocabulary_term
      (id, scope, project_id, kind, name, display_name) VALUES ($1, 'project', $2, 'subject', 'other', 'Other')`, [other, sibling]));
    const [industryTerm] = await scopes.withPlatform((tx) => tx.query<{ id: string }>(
      'SELECT id FROM vocabulary_term WHERE industry_id = $1 LIMIT 1', [oldIndustry],
    ));
    if (industryTerm === undefined) throw new Error('Industry term missing.');
    await scopes.withPlatformAdmin({ actor: { kind: 'system', name: 'migration-fixtures' } }, (tx) => tx.query(
      "INSERT INTO term_synonym (term_id, synonym) VALUES ($1, 'inherited')", [industryTerm.id],
    ));
    await scopes.withTenant(context, (tx) => tx.query("INSERT INTO term_synonym (term_id, synonym) VALUES ($1, 'own alias')", [own]));
    await scopes.withTenant({ ...context, projectId: ProjectId(sibling) }, (tx) => tx.query(
      "INSERT INTO term_synonym (term_id, synonym) VALUES ($1, 'other alias')", [other],
    ));
    for (const target of [other, industryTerm.id]) {
      await expect(scopes.withTenant(context, (tx) => tx.query(
        "INSERT INTO term_synonym (term_id, synonym) VALUES ($1, 'denied')", [target],
      ))).rejects.toMatchObject({ code: '42501' });
      await expect(scopes.withTenant(context, (tx) => tx.query(
        'UPDATE term_synonym SET term_id = $1 WHERE term_id = $2', [target, own],
      ))).rejects.toMatchObject({ code: '42501' });
      await scopes.withTenant(context, async (tx) => {
        expect(await tx.query("UPDATE term_synonym SET synonym = 'denied' WHERE term_id = $1 RETURNING id", [target])).toEqual([]);
        expect(await tx.query('DELETE FROM term_synonym WHERE term_id = $1 RETURNING id', [target])).toEqual([]);
      });
    }
    await scopes.withTenant(context, async (tx) => {
      expect(await tx.query<{ synonym: string }>('SELECT synonym FROM term_synonym ORDER BY synonym'))
        .toEqual([{ synonym: 'inherited' }, { synonym: 'own alias' }]);
      expect(await tx.query("UPDATE term_synonym SET synonym = 'edited' WHERE term_id = $1 RETURNING id", [own])).toHaveLength(1);
      expect(await tx.query('DELETE FROM term_synonym WHERE term_id = $1 RETURNING id', [own])).toHaveLength(1);
    });
  });

  it('E2-035: rolls back the industry and revision when failure occurs after UPDATE', async () => {
    const before = await snapshot();
    const original = scopes.withPlatform;
    const failure = vi.spyOn(scopes, 'withPlatform').mockImplementationOnce((work) => original(async (tx) => {
      await work(tx);
      const [updated] = await tx.query<{ industry_id: string; vocabulary_revision: number }>(
        'SELECT industry_id, vocabulary_revision FROM project WHERE id = $1', [project],
      );
      expect(updated).toEqual({ industry_id: newIndustry, vocabulary_revision: 2 });
      throw new Error('Injected infrastructure failure before commit.');
    }));
    expect((await post()).status).toBe(500);
    failure.mockRestore();
    expect(await snapshot()).toEqual(before);
  });

  it('rejects unknown industries and malformed dryRun without writes', async () => {
    const before = await snapshot();
    expect((await post({ industryId: randomUUID(), confirmation: 'Migration project' })).status).toBe(400);
    expect((await post(undefined, '?dryRun=yes')).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });
});
