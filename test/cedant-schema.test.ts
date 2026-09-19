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
      await tx.query("INSERT INTO cedant (id,project_id,code,name,decimal_separator,date_format) VALUES ($1,$2,'AbC','Declared',',','DD/MM/YYYY')", [cedantId, projectId]);
      await tx.query(`INSERT INTO cedant_file_rule (id,cedant_id,project_id,match_kind,pattern,kind,period_group,sheet_index)
        VALUES ($1,$2,$3,'filename_regex','^abc_(?<period>[0-9-]+).xlsx$','premium','period',1)`, [ruleId, cedantId, projectId]);
    });
  });
  it('exports declarations and permits incomplete rows during the backfill window', async () => {
    const snapshot = await readIdentificationRules(context);
    expect(snapshot.cedants[0]).toMatchObject({ decimalSeparator: ',', dateFormat: 'DD/MM/YYYY' });
    expect(snapshot.rules[0]).toMatchObject({ sheet: null, sheetIndex: 1, headerRow: 1, verifyColumn: null, verifyValue: null });
    await withTenant(context, (tx) => tx.query("INSERT INTO cedant (project_id,code,name) VALUES ($1,'missing','Missing locale')", [projectId]));
    await withTenant(context, (tx) => tx.query('UPDATE cedant_file_rule SET sheet_index=NULL WHERE id=$1', [ruleId]));
    const incomplete = await readIdentificationRules(context);
    expect(incomplete.cedants.find((entry) => entry.code === 'missing')).toMatchObject({ decimalSeparator: null, dateFormat: null });
    expect(incomplete.rules[0]).toMatchObject({ sheet: null, sheetIndex: null });

  });
  it('exports only tenant metadata and rejects foreign writes and cross-project rule parents', async () => {
    expect(await readIdentificationRules(context)).toMatchObject({ cedants: [{ id: cedantId, projectId, code: 'AbC' }], rules: [{ id: ruleId, cedantId }] });
    expect(await readIdentificationRules({ projectId: otherProject, userId })).toEqual({ cedants: [], rules: [] });
    await expect(withTenant(context, (tx) => tx.query("INSERT INTO cedant (project_id,code,name,decimal_separator,date_format) VALUES ($1,'x','Other',',','DD/MM/YYYY')", [otherProject])))
      .rejects.toMatchObject({ code: '42501' });
    await expect(withTenant({ projectId: otherProject, userId }, (tx) => tx.query(`INSERT INTO cedant_file_rule
      (cedant_id,project_id,match_kind,pattern,sheet_index) VALUES ($1,$2,'folder','declared',1)`, [cedantId, otherProject])))
      .rejects.toMatchObject({ code: '23503' });
    await expect(withTenant(context, (tx) => tx.query("INSERT INTO cedant (project_id,code,name,decimal_separator,date_format) VALUES ($1,'abc','Duplicate',',','DD/MM/YYYY')", [projectId])))
      .rejects.toMatchObject({ code: '23505' });
  });
});
