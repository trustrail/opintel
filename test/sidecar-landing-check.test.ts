import { randomUUID } from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
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
resetDatabaseBeforeEach('company');
beforeEach(async () => {
  ctx.projectId = ProjectId(randomUUID()); zone.projectId = ctx.projectId;
  await withPlatform(async tx => {
    const [industry] = await tx.query<{ id: string }>('SELECT id FROM industry LIMIT 1'); industryId = industry!.id;
    const [company] = await tx.query<{ id: string }>("INSERT INTO company(name,default_region) VALUES ('Startup check','eu-west-1') RETURNING id");
    await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES ($1,$2,$3,'Startup check','eu-west-1')", [ctx.projectId, company!.id, industryId]);
  });
});
it('accepts a connected source in the matching project', async () => {
  const [actor]=await withPlatform(tx=>tx.query<{present:boolean}>('SELECT EXISTS(SELECT 1 FROM user_account WHERE id=$1) AS present',['00000000-0000-4000-8000-000000000001']));
  expect(actor?.present).toBe(false);
  await withTenant(ctx, tx => tx.query("INSERT INTO data_source(id,project_id,kind,name,exposed_alias,credential_ref) VALUES ($1,$2,'postgres','Startup','startup','secret://test/startup')", [sourceId, ctx.projectId]));
  await expect(checkDevelopmentLandingZones([zone])).resolves.toBeUndefined();
});
it('bootstrap imports cannot capture database configuration before the environment is loaded',async()=>{
 const script=`delete process.env.DATABASE_URL;
 await import('./scripts/sidecar-dev.ts');
 process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
 const {withPlatform}=await import('./src/platform/db/scope.ts');
 try { await withPlatform(tx=>tx.query('SELECT 1')); process.exit(0); }
 catch(error){console.error(error.name+': '+error.message);process.exit(1);}`;
 await expect(promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script],{timeout:15000})).resolves.toBeDefined();
},20000);
it('names both stale IDs, the zone and the development recovery after a database reset', async () => {
  const projectId = ProjectId(randomUUID());
  await expect(checkDevelopmentLandingZones([{ ...zone, projectId }])).rejects.toThrow(
    `development landing zone ${zone.directory} (project ${projectId}, source ${sourceId}): The referenced project no longer exists; no connected source exists for this project and source. In development, removing tmp/sidecar`);
});
it('does not accept a connected source from another project', async () => {
  await withTenant(ctx, tx => tx.query("INSERT INTO data_source(id,project_id,kind,name,exposed_alias,credential_ref) VALUES ($1,$2,'postgres','Startup','startup','secret://test/startup')", [sourceId, ctx.projectId]));
  const other = ProjectId(randomUUID());
  await withPlatform(tx => tx.query("INSERT INTO project(id,company_id,industry_id,name,region) SELECT $1,company_id,industry_id,'Other','eu-west-1' FROM project WHERE id=$2", [other, ctx.projectId]));
  await expect(checkDevelopmentLandingZones([{ ...zone, projectId: other }])).rejects.toThrow('no connected source exists');
});
