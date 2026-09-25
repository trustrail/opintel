import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { loadDevEnvironment } from './dev-environment.js';
import { prepareSidecarDevelopment, sidecarDevDirectory } from './sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { demoIdentification } from '../src/modules/sources/demo/metadata.js';
import { ProjectId, UserId, SourceId, DemoSourceId, IndustryId, DomainError } from '../src/shared/kernel/index.js';
import { SecretRef } from '../src/platform/secrets/types.js';

async function main(): Promise<void> {
  loadDevEnvironment();
  const [command, projectArg, userArg, sourceArg] = process.argv.slice(2);
  if (!['prepare','provision'].includes(command ?? '') || !projectArg || !userArg)
    throw new Error('Usage: npm run demo:pack -- prepare|provision PROJECT_ID USER_ID [SOURCE_ID]');
  const ctx = { projectId: ProjectId(projectArg), userId: UserId(userArg) };
  if (command === 'provision' && !sourceArg) throw new Error('Provision requires the source ID printed by prepare.');
  let sourceId = SourceId(sourceArg ?? randomUUID());
  // Load the scope only after development environment has been configured.
  const [{ withPlatform, withTenant, withPlatformAdmin }, { readDemoTemplate }] = await Promise.all([
    import('../src/platform/db/scope.js'), import('../src/modules/sources/demo/templates.js'),
  ]);
  const [project] = await withPlatform((tx) => tx.query<{ industry_id: string }>('SELECT industry_id FROM project WHERE id=$1',[ctx.projectId]));
  if (!project) throw new Error('Project does not exist.');
  const templateId = DemoSourceId('31100000-0000-4000-8000-000000000001');
  const selected = await readDemoTemplate(IndustryId(project.industry_id),templateId);
  if (!selected.ok) throw selected.error;
  const template = selected.value;
  const prepared = template.deploymentRef[ctx.projectId];
  if (prepared) { if (sourceArg && sourceArg !== prepared.sourceId) throw new Error("The project already reserves another source ID."); sourceId = prepared.sourceId; }
  const serviceFile = process.env.SIDECAR_CONFIG_FILE ?? join(sidecarDevDirectory,'service.json');
  if (command === 'prepare') {
    await prepareSidecarDevelopment(dirname(serviceFile));
    const credentialRef = SecretRef('secret://demo/postgres');
    const sourceName = `demo_${sourceId.replaceAll('-','')}`;
    const metadata = demoIdentification(ctx.projectId,sourceId,template.generatorSpec);
    for (const party of metadata.filingParties) await withTenant(ctx,async (tx) => {
      await tx.query(`INSERT INTO filing_party(id,project_id,code,name,decimal_separator,date_format) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,[party.id,ctx.projectId,party.code,party.name,party.decimalSeparator,party.dateFormat]);
      for (const rule of metadata.rules.filter((entry) => entry.partyId===party.id)) await tx.query(`INSERT INTO filing_party_rule(id,project_id,party_id,match_kind,pattern,kind,period_group,priority,sheet,header_row,period_as_at_format)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,[rule.id,ctx.projectId,rule.partyId,rule.matchKind,rule.pattern,rule.kind,rule.periodGroup,rule.priority,rule.sheet,rule.headerRow,rule.periodAsAtFormat]);
    });
    const root = resolve(dirname(serviceFile),'landing',sourceId);
    await mkdir(join(root,'inbox'),{recursive:true,mode:0o700});
    const rulesFile = join(root,'rules.json'); await writeFile(rulesFile,JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
    const { config } = await loadSidecarConfig(serviceFile);
    const original = JSON.parse(await readFile(serviceFile,'utf8')) as Record<string,unknown>;
    const zones = config.landingZones ?? [];
    const existingZone = zones.find((zone) => zone.sourceId === sourceId);
    if (existingZone?.pollMs === 25) existingZone.pollMs = 1000;
    if (!zones.some((zone)=>zone.sourceId===sourceId)) zones.push({projectId:ctx.projectId,sourceId,directory:join(root,'inbox'),stateFile:join(root,'register.json'),rulesFile,pollMs:1000,
      landing:{name:sourceName,credentialRef,strategy:'append_as_at'}});
    const updated = {...original,demo:{database:'opintel_demo',credentialRef},receiptUrl:config.receiptUrl ?? 'https://127.0.0.1:3101',landingZones:zones};
    await writeFile(serviceFile+'.next',JSON.stringify(updated,null,2)+'\n',{mode:0o600}); await rename(serviceFile+'.next',serviceFile);
    await withPlatformAdmin({actor:{kind:'user',id:ctx.userId}},tx=>tx.query(
      `UPDATE demo_source_template SET deployment_ref=jsonb_set(deployment_ref,ARRAY[$2::text],$3::jsonb) WHERE id=$1`,
      [templateId,ctx.projectId,JSON.stringify({sourceId,credentialRef,landingZone:join(root,'inbox'),sourceName})]));
    console.info(`Prepared demo source ${sourceId}. Restart the sidecar with dev:up, start dev:api, then run demo:pack provision with this source ID.`);
    return;
  }
  if (!prepared || prepared.sourceId !== sourceId) throw new Error('Prepare this source before connecting.');
  const { loadSidecarClientOptions } = await import('../src/modules/sources/index.js');
  const { createSourceRuntime } = await import('../src/modules/sources/infrastructure/source-runtime.js');
  const { createRedisConnection } = await import('../src/platform/redis/index.js');
  const { RedisProjectHub } = await import('../src/platform/sse/redis-hub.js');
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for project change notifications.');
  const redis = createRedisConnection({ url: process.env.REDIS_URL });
  await redis.connect();
  const hub = new RedisProjectHub(redis.client, process.env.REDIS_URL);
  const runtime=createSourceRuntime(await loadSidecarClientOptions(process.env.SIDECAR_CLIENT_CONFIG ?? join(sidecarDevDirectory,'client.json')),hub);
  try { const result=await runtime.demo(ctx,templateId);if(!result.ok)throw result.error;const completed=await runtime.idle();if(!completed.ok)throw completed.error; }
  finally {await runtime.close();await hub.close();await redis.close();}
  console.info(`Demo source ${sourceId} connected. Inspect its catalogue and register for outcomes.`);
}
void main().catch((error: unknown) => { if (error instanceof DomainError) {console.error({ event: 'demo.command_failed', errorCategory: error.code });process.stderr.write(error.message+'\n');} console.error('Demo command failed. Check the project, source, configured Vault reference, running API/sidecar and local register. No existing arrivals were replaced.'); process.exitCode=1; });
