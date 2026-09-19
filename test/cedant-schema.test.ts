import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { ProjectId, UserId } from '../src/shared/kernel/index.js';
import { readIdentificationRules } from '../src/modules/ingest/index.js';

const integration = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
const projectId = ProjectId(randomUUID());
const otherProject = ProjectId(randomUUID());
const userId = UserId(randomUUID());
const cedantId = randomUUID();
const ruleId = randomUUID();
const context = { projectId, userId };
integration('cedant identification metadata in tenant scopes', () => {
  resetDatabaseBeforeEach('company');
  beforeEach(async () => {
    await withPlatform(async (tx) => {
      const [industry] = await tx.query<{ id: string }>('SELECT id FROM industry LIMIT 1');
      const [company] = await tx.query<{ id: string }>("INSERT INTO company (name, default_region) VALUES ('Ingest test', 'eu-west-1') RETURNING id");
      await tx.query(`INSERT INTO project (id, company_id, industry_id, name, region) VALUES
        ($1,$3,$4,'Ingest A','eu-west-1'),($2,$3,$4,'Ingest B','eu-west-1')`, [projectId, otherProject, company!.id, industry!.id]);
    });
    await withTenant(context, async (tx) => {
      await tx.query("INSERT INTO cedant (id,project_id,code,name) VALUES ($1,$2,'AbC','Declared')", [cedantId, projectId]);
      await tx.query(`INSERT INTO cedant_file_rule (id,cedant_id,project_id,match_kind,pattern,kind,period_group)
        VALUES ($1,$2,$3,'filename_regex','^abc_(?<period>[0-9-]+).xlsx$','premium','period')`, [ruleId, cedantId, projectId]);
    });
  });
  it('exports only tenant metadata and rejects foreign writes and cross-project rule parents', async () => {
    expect(await readIdentificationRules(context)).toMatchObject({ cedants: [{ id: cedantId, projectId, code: 'AbC' }], rules: [{ id: ruleId, cedantId }] });
    expect(await readIdentificationRules({ projectId: otherProject, userId })).toEqual({ cedants: [], rules: [] });
    await expect(withTenant(context, (tx) => tx.query("INSERT INTO cedant (project_id,code,name) VALUES ($1,'x','Other')", [otherProject])))
      .rejects.toMatchObject({ code: '42501' });
    await expect(withTenant({ projectId: otherProject, userId }, (tx) => tx.query(`INSERT INTO cedant_file_rule
      (cedant_id,project_id,match_kind,pattern) VALUES ($1,$2,'folder','declared')`, [cedantId, otherProject])))
      .rejects.toMatchObject({ code: '23503' });
    await expect(withTenant(context, (tx) => tx.query("INSERT INTO cedant (project_id,code,name) VALUES ($1,'abc','Duplicate')", [projectId])))
      .rejects.toMatchObject({ code: '23505' });
  });
});
