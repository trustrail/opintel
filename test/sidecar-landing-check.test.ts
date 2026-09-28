import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { checkDevelopmentLandingZones } from '../scripts/sidecar-landing-check.js';
import { withPlatform, withPlatformAdmin, withTenant } from '../src/platform/db/scope.js';
import { ProjectId, SourceId, UserId } from '../src/shared/kernel/index.js';
import type { LandingZone } from '../sidecar/ingest/watch.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';

const ctx = { projectId: ProjectId(randomUUID()), userId: UserId(randomUUID()) };
const sourceId = SourceId(randomUUID());
const zone: LandingZone = { projectId: ctx.projectId, sourceId, directory: '/development/landing/inbox', stateFile: '/development/landing/state.json', rulesFile: '/development/landing/rules.json', pollMs: 1000 };
let industryId: string;
const templates: string[] = [];
afterEach(async () => {
  await withPlatformAdmin({ actor: { kind: 'user', id: ctx.userId } }, tx => tx.query('DELETE FROM demo_source_template WHERE id=ANY($1::uuid[])', [templates]));
  templates.length = 0;
});
resetDatabaseBeforeEach('company');
beforeEach(async () => {
  ctx.projectId = ProjectId(randomUUID()); zone.projectId = ctx.projectId;
  await withPlatform(async tx => {
    const [industry] = await tx.query<{ id: string }>('SELECT id FROM industry LIMIT 1'); industryId = industry!.id;
    const [company] = await tx.query<{ id: string }>("INSERT INTO company(name,default_region) VALUES ('Startup check','eu-west-1') RETURNING id");
    await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES ($1,$2,$3,'Startup check','eu-west-1')", [ctx.projectId, company!.id, industryId]);
  });
});
async function reserve(projectId = ctx.projectId, reservedSource = sourceId) {
  const [template] = await withPlatformAdmin({ actor: { kind: 'user', id: ctx.userId } }, tx => tx.query<{ id: string }>(`
    INSERT INTO demo_source_template(industry_id,name,kind,schema_spec,generator_spec,deployment_ref)
    VALUES ($1,$2,'spreadsheet','{}','{}',$3) RETURNING id`, [industryId, randomUUID(), JSON.stringify({ [projectId]: { sourceId: reservedSource } })]));
  templates.push(template!.id);
}
it('accepts a connected source in the matching project', async () => {
  await withTenant(ctx, tx => tx.query("INSERT INTO data_source(id,project_id,kind,name,exposed_alias,credential_ref) VALUES ($1,$2,'postgres','Startup','startup','secret://test/startup')", [sourceId, ctx.projectId]));
  await expect(checkDevelopmentLandingZones([zone])).resolves.toBeUndefined();
});
it('accepts E2-013 preparation before Connect creates data_source', async () => {
  await reserve();
  await expect(checkDevelopmentLandingZones([zone])).resolves.toBeUndefined();
});
it('names both stale IDs, the zone and the development recovery after a database reset', async () => {
  const projectId = ProjectId(randomUUID());
  await expect(checkDevelopmentLandingZones([{ ...zone, projectId }])).rejects.toThrow(
    `development landing zone ${zone.directory} (project ${projectId}, source ${sourceId}): The referenced project no longer exists; no connected source or valid reserved demo deployment exists for this project and source. In development, removing tmp/sidecar`);
});
it('rejects a reservation left behind for a deleted project', async () => {
  const projectId = ProjectId(randomUUID()); await reserve(projectId);
  await expect(checkDevelopmentLandingZones([{ ...zone, projectId }])).rejects.toThrow('The referenced project no longer exists');
});
it('does not accept a reservation for another source or another project', async () => {
  await reserve(ctx.projectId, SourceId(randomUUID())); await reserve(ProjectId(randomUUID()));
  await expect(checkDevelopmentLandingZones([zone])).rejects.toThrow('The project exists, but neither a connected source nor a reserved demo deployment exists for this source ID.');
});
it('does not accept a connected source from another project', async () => {
  await withTenant(ctx, tx => tx.query("INSERT INTO data_source(id,project_id,kind,name,exposed_alias,credential_ref) VALUES ($1,$2,'postgres','Startup','startup','secret://test/startup')", [sourceId, ctx.projectId]));
  const other = ProjectId(randomUUID());
  await withPlatform(tx => tx.query("INSERT INTO project(id,company_id,industry_id,name,region) SELECT $1,company_id,industry_id,'Other','eu-west-1' FROM project WHERE id=$2", [other, ctx.projectId]));
  await expect(checkDevelopmentLandingZones([{ ...zone, projectId: other }])).rejects.toThrow('neither a connected source nor a reserved demo deployment exists');
});
