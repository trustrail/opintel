import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant, type Tx } from '../src/platform/db/scope.js';
import { ProjectId, UserId } from '../src/shared/kernel/index.js';

const integration = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
const userId = UserId(randomUUID());
const projectId = ProjectId(randomUUID());
const otherProject = ProjectId(randomUUID());
const source = randomUUID();
const object = randomUUID();
const element = randomUUID();
const scope = <T>(work: (tx: Tx) => Promise<T>) => withTenant({ userId, projectId }, work);

integration('catalogue schema with Postgres', () => {
  resetDatabaseBeforeEach('company');
  beforeEach(async () => {
    await withPlatform(async (tx) => {
      const [industry] = await tx.query<{ id: string }>('SELECT id FROM industry ORDER BY id LIMIT 1');
      if (industry === undefined) throw new Error('Missing industry.');
      const [company] = await tx.query<{ id: string }>("INSERT INTO company (name, default_region) VALUES ('Catalogue tests', 'eu-west-1') RETURNING id");
      if (company === undefined) throw new Error('Missing company.');
      await tx.query(`INSERT INTO project (id, company_id, industry_id, name, region) VALUES
        ($1, $3, $4, 'Catalogue A', 'eu-west-1'), ($2, $3, $4, 'Catalogue B', 'eu-west-1')`, [projectId, otherProject, company.id, industry.id]);
    });
    await scope(async (tx) => {
      await tx.query(`INSERT INTO data_source (id, project_id, kind, name, credential_ref)
        VALUES ($1, $2, 'postgres', 'Warehouse', 'vault://test/warehouse')`, [source, projectId]);
      await tx.query(`INSERT INTO catalog_object (id, source_id, project_id, schema_name, object_name, object_kind, duckdb_schema, duckdb_name)
        VALUES ($1, $2, $3, 'public', 'Orders', 'table', 'public', 'orders')`, [object, source, projectId]);
      await tx.query(`INSERT INTO catalog_element (id, object_id, project_id, source_identifier, duckdb_name, stable_ref, source_type, duckdb_type)
        VALUES ($1, $2, $3, 'Customer Name', 'customer_name', '1', 'text', 'VARCHAR')`, [element, object, projectId]);
      await tx.query('INSERT INTO element_stats (element_id, cardinality) VALUES ($1, 5)', [element]);
    });
  });

  it('G-006/G-012: source names can change while stored identity and exposed names remain fixed', async () => {
    await scope(async (tx) => {
      await tx.query("UPDATE catalog_element SET source_identifier = 'Account Holder' WHERE id = $1", [element]);
      await tx.query("UPDATE catalog_object SET object_name = 'Renamed Orders' WHERE id = $1", [object]);
    });
    for (let run = 0; run < 2; run += 1) {
      expect(await scope((tx) => tx.query('SELECT id, source_identifier, duckdb_name, stable_ref FROM catalog_element WHERE id = $1', [element])))
        .toEqual([{ id: element, source_identifier: 'Account Holder', duckdb_name: 'customer_name', stable_ref: '1' }]);
    }
    for (const [table, id, field] of [['catalog_element', element, 'duckdb_name'], ['catalog_object', object, 'duckdb_name'], ['catalog_object', object, 'duckdb_schema']] as const) {
      await expect(scope((tx) => tx.query(`UPDATE ${table} SET ${field} = 'changed' WHERE id = $1`, [id])))
        .rejects.toMatchObject({ code: '23514' });
    }
  });

  it('G-011: permits explicit adoption with one name revision, but rejects ordinary and malformed updates', async () => {
    for (const [table, id] of [['catalog_object', object], ['catalog_element', element]] as const) {
      await expect(scope((tx) => tx.query(`UPDATE ${table} SET duckdb_name = 'adopted' WHERE id = $1`, [id])))
        .rejects.toMatchObject({ code: '23514' });
      await expect(scope((tx) => tx.query(`UPDATE ${table} SET duckdb_name = 'adopted', name_revision = name_revision + 2 WHERE id = $1`, [id])))
        .rejects.toMatchObject({ code: '23514' });
      expect(await scope((tx) => tx.query(`UPDATE ${table} SET duckdb_name = 'adopted', name_revision = name_revision + 1 WHERE id = $1
        RETURNING duckdb_name, name_revision`, [id])))
        .toEqual([{ duckdb_name: 'adopted', name_revision: 1 }]);
      await expect(scope((tx) => tx.query(`UPDATE ${table} SET duckdb_name = 'ordinary' WHERE id = $1`, [id])))
        .rejects.toMatchObject({ code: '23514' });
      await expect(scope((tx) => tx.query(`UPDATE ${table} SET name_revision = name_revision + 1 WHERE id = $1`, [id])))
        .rejects.toMatchObject({ code: '23514' });
    }
  });

  it('retains unnameable and unsupported elements, and does not permit implicit assignment on rediscovery', async () => {
    const id = randomUUID();
    await scope((tx) => tx.query(`INSERT INTO catalog_element
      (id, object_id, project_id, source_identifier, duckdb_name, source_type, duckdb_type)
      VALUES ($1, $2, $3, '😀', NULL, 'geometry', NULL)`, [id, object, projectId]));
    expect(await scope((tx) => tx.query('SELECT duckdb_name, duckdb_type, source_type FROM catalog_element WHERE id = $1', [id])))
      .toEqual([{ duckdb_name: null, duckdb_type: null, source_type: 'geometry' }]);
    await expect(scope((tx) => tx.query("UPDATE catalog_element SET duckdb_name = 'alias' WHERE id = $1", [id])))
      .rejects.toMatchObject({ code: '23514' });
    await scope((tx) => tx.query("UPDATE catalog_element SET duckdb_name = 'alias', name_revision = name_revision + 1 WHERE id = $1", [id]));
  });

  it('G-007: retains the removed row and its statistics beside the new identity', async () => {
    const fresh = randomUUID();
    await scope(async (tx) => {
      await tx.query("UPDATE catalog_element SET stable_ref = NULL, status = 'removed', removed_at = now() WHERE id = $1", [element]);
      await tx.query(`INSERT INTO catalog_element (id, object_id, project_id, source_identifier, duckdb_name, source_type, duckdb_type)
        VALUES ($1, $2, $3, 'New Name', 'new_name', 'text', 'VARCHAR')`, [fresh, object, projectId]);
    });
    expect(await scope((tx) => tx.query('SELECT id, status FROM catalog_element ORDER BY status')))
      .toEqual([{ id: fresh, status: 'active' }, { id: element, status: 'removed' }]);
    expect(await scope((tx) => tx.query('SELECT element_id FROM element_stats'))).toEqual([{ element_id: element }]);
    await expect(scope((tx) => tx.query(`INSERT INTO catalog_element
      (object_id, project_id, source_identifier, duckdb_name, source_type, duckdb_type)
      VALUES ($1, $2, 'Collision', 'customer_name', 'text', 'VARCHAR')`, [object, projectId])))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('isolates every new table, including statistics reached through an element', async () => {
    await scope((tx) => tx.query('INSERT INTO introspection_run (source_id, project_id) VALUES ($1, $2)', [source, projectId]));
    for (const table of ['data_source', 'introspection_run', 'catalog_object', 'catalog_element', 'element_stats']) {
      expect(await withTenant({ userId, projectId: otherProject }, (tx) => tx.query(`SELECT * FROM ${table}`))).toEqual([]);
      const policies = await withPlatform((tx) => tx.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        'SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass', [table],
      ));
      expect(policies).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    }
    await expect(withTenant({ userId, projectId: otherProject }, (tx) => tx.query(
      'INSERT INTO element_stats (element_id) VALUES ($1)', [element],
    ))).rejects.toMatchObject({ code: '42501' });
    await expect(withTenant({ userId, projectId: otherProject }, (tx) => tx.query(`INSERT INTO catalog_element
      (object_id, project_id, source_identifier, duckdb_name, source_type, duckdb_type)
      VALUES ($1, $2, 'Forbidden', 'forbidden', 'text', 'VARCHAR')`, [object, projectId])))
      .rejects.toMatchObject({ code: '42501' });
    // An own-project row must not point to a parent from another project.
    await expect(withTenant({ userId, projectId: otherProject }, (tx) => tx.query(`INSERT INTO catalog_element
      (object_id, project_id, source_identifier, duckdb_name, source_type, duckdb_type)
      VALUES ($1, $2, 'Forbidden', 'forbidden', 'text', 'VARCHAR')`, [object, otherProject])))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('rejects a customer source without a vault reference', async () => {
    for (const credential of [null, 'literal-secret']) {
      await expect(scope((tx) => tx.query(`INSERT INTO data_source (project_id, kind, name, credential_ref)
        VALUES ($1, 'postgres', 'Invalid', $2)`, [projectId, credential])))
        .rejects.toMatchObject({ code: '23514', constraint: 'credential_matches_origin' });
    }
  });
});
