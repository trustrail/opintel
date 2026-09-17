import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ProjectId, UserId, type ProjectId as ProjectIdValue } from '../src/shared/kernel/index.js';
import { withPlatform, withPlatformAdmin, withTenant } from '../src/platform/db/scope.js';

const databaseTestsRequired = process.env.REQUIRE_DB_TESTS === '1';
const databaseIntegration = process.env.DATABASE_URL === undefined && !databaseTestsRequired
  ? describe.skip
  : describe;

const actor = { kind: 'system' as const, name: 'rls-test' };
const userId = UserId('018f8f9d-7f83-7abc-8def-0123456789ab');

type IdRow = { id: string };
type ProjectRow = { project_id: string };
type SettingRow = { project_setting: string | null };
type RoleRow = { rolsuper: boolean; rolbypassrls: boolean };
type OwnershipRow = { relname: string };
type PolicyRow = {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_names: string;
};
type RlsTableRow = { table_name: string; rls_forced: boolean };

type Fixture = {
  industryId: string;
  companyId: string;
  projectIds: ProjectIdValue[];
};

const fixtures: Fixture[] = [];

function requiredRow<Row>(rows: readonly Row[], message: string): Row {
  const row = rows[0];
  if (row === undefined) throw new Error(message);
  return row;
}

async function createFixture(projectCount: number): Promise<Fixture> {
  const fixture = await withPlatformAdmin(actor, async (tx) => {
    const suffix = randomUUID();
    const industries = await tx.query<IdRow>(
      'INSERT INTO industry (slug, name) VALUES ($1, $2) RETURNING id',
      [`rls-${suffix}`, 'RLS test industry'],
    );
    const industryId = requiredRow(industries, 'Industry creation failed.').id;
    const companies = await tx.query<IdRow>(
      'INSERT INTO company (name, default_industry_id, default_region) VALUES ($1, $2, $3) RETURNING id',
      ['RLS test company', industryId, 'us-east-1'],
    );
    const companyId = requiredRow(companies, 'Company creation failed.').id;
    const projectIds: ProjectIdValue[] = [];
    for (let index = 0; index < projectCount; index += 1) {
      const projects = await tx.query<IdRow>(
        'INSERT INTO project (company_id, industry_id, name, region) VALUES ($1, $2, $3, $4) RETURNING id',
        [companyId, industryId, `RLS project ${index}`, 'us-east-1'],
      );
      projectIds.push(ProjectId(requiredRow(projects, 'Project creation failed.').id));
    }
    return { industryId, companyId, projectIds };
  });
  fixtures.push(fixture);
  return fixture;
}

async function insertCandidate(projectId: ProjectIdValue, expression: string): Promise<void> {
  await withTenant({ userId, projectId }, (tx) => tx.query(
    'INSERT INTO synonym_candidate (project_id, expression) VALUES ($1, $2)',
    [projectId, expression],
  ));
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  for (const projectId of fixture.projectIds) {
    await withTenant({ userId, projectId }, (tx) => tx.query(
      'DELETE FROM synonym_candidate WHERE project_id = $1',
      [projectId],
    ));
  }
  await withPlatformAdmin(actor, async (tx) => {
    await tx.query('DELETE FROM project WHERE company_id = $1', [fixture.companyId]);
    await tx.query('DELETE FROM company WHERE id = $1', [fixture.companyId]);
    await tx.query('DELETE FROM industry WHERE id = $1', [fixture.industryId]);
  });
}

beforeAll(() => {
  if (process.env.DATABASE_URL === undefined) {
    throw new Error('DATABASE_URL is required when REQUIRE_DB_TESTS=1.');
  }
});

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(cleanupFixture));
});

databaseIntegration('row-level security', () => {
  it('RLS-01: returns no project A rows while scoped to project B', async () => {
    const fixture = await createFixture(2);
    const projectA = requiredRow(fixture.projectIds, 'Project A is missing.');
    const projectB = fixture.projectIds[1];
    if (projectB === undefined) throw new Error('Project B is missing.');
    await insertCandidate(projectA, 'project-a-only');

    const rows = await withTenant({ userId, projectId: projectB }, (tx) => tx.query<ProjectRow>(
      'SELECT project_id FROM synonym_candidate WHERE project_id = $1',
      [projectA],
    ));

    expect(rows).toEqual([]);
  });

  it('RLS-02: rejects an insert carrying another project id', async () => {
    const fixture = await createFixture(2);
    const projectA = requiredRow(fixture.projectIds, 'Project A is missing.');
    const projectB = fixture.projectIds[1];
    if (projectB === undefined) throw new Error('Project B is missing.');

    await expect(withTenant({ userId, projectId: projectB }, (tx) => tx.query(
      'INSERT INTO synonym_candidate (project_id, expression) VALUES ($1, $2)',
      [projectA, 'cross-project-write'],
    ))).rejects.toThrow(/row-level security/i);
  });

  it('RLS-03: clears app.project_id after commit before returning a connection to the pool', async () => {
    const fixture = await createFixture(1);
    const projectId = requiredRow(fixture.projectIds, 'Project is missing.');
    await withTenant({ userId, projectId }, async () => undefined);

    const setting = await withPlatform(async (tx) => requiredRow(await tx.query<SettingRow>(
      "SELECT current_setting('app.project_id', true) AS project_setting",
    ), 'Setting query failed.').project_setting);

    // PostgreSQL keeps a known custom GUC as an empty setting after a local
    // assignment is reverted. Empty is its representation of no project id.
    expect(setting).toBe('');
  });

  it('RLS-04: clears app.project_id after rollback before returning a connection to the pool', async () => {
    const fixture = await createFixture(1);
    const projectId = requiredRow(fixture.projectIds, 'Project is missing.');
    await expect(withTenant({ userId, projectId }, async () => {
      throw new Error('rollback test');
    })).rejects.toThrow('rollback test');

    const setting = await withPlatform(async (tx) => requiredRow(await tx.query<SettingRow>(
      "SELECT current_setting('app.project_id', true) AS project_setting",
    ), 'Setting query failed.').project_setting);

    expect(setting).toBe('');
  });

  it('RLS-05: rolls back a callback failure and releases a clean connection', async () => {
    const fixture = await createFixture(1);
    const projectId = requiredRow(fixture.projectIds, 'Project is missing.');
    await expect(withTenant({ userId, projectId }, async (tx) => {
      await tx.query('INSERT INTO synonym_candidate (project_id, expression) VALUES ($1, $2)', [projectId, 'rollback-row']);
      throw new Error('callback failed');
    })).rejects.toThrow('callback failed');

    const rows = await withTenant({ userId, projectId }, (tx) => tx.query<ProjectRow>(
      'SELECT project_id FROM synonym_candidate WHERE expression = $1',
      ['rollback-row'],
    ));
    const setting = await withPlatform(async (tx) => requiredRow(await tx.query<SettingRow>(
      "SELECT current_setting('app.project_id', true) AS project_setting",
    ), 'Setting query failed.').project_setting);

    expect(rows).toEqual([]);
    expect(setting).toBe('');
  });

  it('RLS-06: isolates fifty concurrent requests across five projects', async () => {
    const fixture = await createFixture(5);
    await Promise.all(fixture.projectIds.flatMap((projectId, index) => [
      insertCandidate(projectId, `candidate-${index}-one`),
      insertCandidate(projectId, `candidate-${index}-two`),
    ]));

    const reads = Array.from({ length: 50 }, async (_, index) => {
      const projectId = fixture.projectIds[index % fixture.projectIds.length];
      if (projectId === undefined) throw new Error('Project is missing.');
      const rows = await withTenant({ userId, projectId }, (tx) => tx.query<ProjectRow>(
        'SELECT project_id FROM synonym_candidate ORDER BY expression',
      ));
      return { projectId, rows };
    });
    const results = await Promise.all(reads);

    for (const result of results) {
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((row) => row.project_id === result.projectId)).toBe(true);
    }
  });

  it('RLS-08: permits platform data reads from a tenant scope', async () => {
    const fixture = await createFixture(1);
    const projectId = requiredRow(fixture.projectIds, 'Project is missing.');

    const rows = await withTenant({ userId, projectId }, (tx) => tx.query<IdRow>(
      'SELECT id FROM industry WHERE id = $1',
      [fixture.industryId],
    ));

    expect(rows).toHaveLength(1);
  });

  it('RLS-09: rejects an industry write from a tenant scope', async () => {
    const fixture = await createFixture(1);
    const projectId = requiredRow(fixture.projectIds, 'Project is missing.');

    await expect(withTenant({ userId, projectId }, (tx) => tx.query(
      'INSERT INTO industry (slug, name) VALUES ($1, $2)',
      [`tenant-write-${randomUUID()}`, 'Rejected tenant write'],
    ))).rejects.toThrow(/permission denied/i);
  });

  it('RLS-10: forces RLS and named policies on every structurally discovered tenant table', async () => {
    const role = await withPlatform(async (tx) => requiredRow(await tx.query<RoleRow>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'opintel_app'",
    ), 'opintel_app role is missing.'));
    const owned = await withPlatform(async (tx) => tx.query<OwnershipRow>(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_roles r ON r.oid = c.relowner
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute project_id
         ON project_id.attrelid = c.oid
        AND project_id.attname = 'project_id'
        AND project_id.attnotnull
        AND NOT project_id.attisdropped
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND r.rolname = 'opintel_app'`,
    ));
    const policies = await withPlatform(async (tx) => tx.query<PolicyRow>(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
              string_agg(p.policyname, ',' ORDER BY p.policyname) AS policy_names
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute project_id
         ON project_id.attrelid = c.oid
        AND project_id.attname = 'project_id'
        AND project_id.attnotnull
        AND NOT project_id.attisdropped
       LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity`,
    ));
    const protectedTables = await withPlatform(async (tx) => tx.query<RlsTableRow>(
      `SELECT c.relname AS table_name, c.relforcerowsecurity AS rls_forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity`,
    ));

    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    expect(owned).toEqual([]);
    expect(policies).not.toEqual([]);
    for (const policy of policies) {
      expect(policy.rls_enabled).toBe(true);
      expect(policy.rls_forced).toBe(true);
      expect(policy.policy_names.split(',')).toEqual(expect.arrayContaining(['tenant_read', 'tenant_write']));
    }
    expect(protectedTables).not.toEqual([]);
    for (const table of protectedTables) expect(table.rls_forced).toBe(true);
  });
});
