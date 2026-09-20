import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadDevEnvironment } from './dev-environment.js';
import { prepareSidecarDevelopment, sidecarDevDirectory } from './sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { provisionDemoPayload } from '../src/shared/demo-contract.js';
import { demoIdentification } from '../src/modules/sources/demo/metadata.js';
import { ProjectId, UserId, SourceId, DemoSourceId, IndustryId, UuidV7IdFactory } from '../src/shared/kernel/index.js';
import { VaultRef } from '../src/platform/vault/types.js';

async function main(): Promise<void> {
  loadDevEnvironment();
  const [command, projectArg, userArg, sourceArg] = process.argv.slice(2);
  if (!['prepare','provision'].includes(command ?? '') || !projectArg || !userArg)
    throw new Error('Usage: npm run demo:pack -- prepare|provision PROJECT_ID USER_ID [SOURCE_ID]');
  const ctx = { projectId: ProjectId(projectArg), userId: UserId(userArg) };
  if (command === 'provision' && !sourceArg) throw new Error('Provision requires the source ID printed by prepare.');
  const sourceId = SourceId(sourceArg ?? randomUUID());
  // Load the scope only after development environment has been configured.
  const [{ withPlatform, withTenant }, { readDemoTemplate }] = await Promise.all([
    import('../src/platform/db/scope.js'), import('../src/modules/sources/demo/templates.js'),
  ]);
  const [project] = await withPlatform((tx) => tx.query<{ industry_id: string }>('SELECT industry_id FROM project WHERE id=$1',[ctx.projectId]));
  if (!project) throw new Error('Project does not exist.');
  const templateId = DemoSourceId('31100000-0000-4000-8000-000000000001');
  const selected = await readDemoTemplate(IndustryId(project.industry_id),templateId);
  if (!selected.ok) throw selected.error;
  const template = selected.value;
  const serviceFile = process.env.SIDECAR_CONFIG_FILE ?? join(sidecarDevDirectory,'service.json');
  if (command === 'prepare') {
    await prepareSidecarDevelopment();
    const credentialRef = VaultRef('vault://demo/postgres');
    const sourceName = `demo_${sourceId.replaceAll('-','')}`;
    await withTenant(ctx,async (tx) => {
      const [existing] = await tx.query<{ demo_template_id: string | null }>('SELECT demo_template_id FROM data_source WHERE id=$1',[sourceId]);
      if (existing) {
        if (existing.demo_template_id !== templateId) throw new Error('Source ID already belongs to another source.');
        return;
      }
      await tx.query(`INSERT INTO data_source(id,project_id,kind,origin,demo_template_id,name,credential_ref,receives_landings,landing_strategy)
        VALUES($1,$2,'postgres','demo',$3,$4,$5,true,'append_as_at')`,[sourceId,ctx.projectId,templateId,sourceName,credentialRef]);
    });
    const metadata = demoIdentification(ctx.projectId,sourceId,template.generatorSpec);
    for (const party of metadata.filingParties) await withTenant(ctx,async (tx) => {
      await tx.query(`INSERT INTO filing_party(id,project_id,code,name,decimal_separator,date_format) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,[party.id,ctx.projectId,party.code,party.name,party.decimalSeparator,party.dateFormat]);
      for (const rule of metadata.rules.filter((entry) => entry.partyId===party.id)) await tx.query(`INSERT INTO filing_party_rule(id,project_id,party_id,match_kind,pattern,kind,period_group,priority,sheet,header_row,period_as_at_format)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,[rule.id,ctx.projectId,rule.partyId,rule.matchKind,rule.pattern,rule.kind,rule.periodGroup,rule.priority,rule.sheet,rule.headerRow,rule.periodAsAtFormat]);
    });
    const root = resolve(sidecarDevDirectory,'landing',sourceId);
    await mkdir(join(root,'inbox'),{recursive:true,mode:0o700});
    const rulesFile = join(root,'rules.json'); await writeFile(rulesFile,JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
    const { config } = await loadSidecarConfig(serviceFile);
    const original = JSON.parse(await readFile(serviceFile,'utf8')) as Record<string,unknown>;
    const zones = config.landingZones ?? [];
    if (!zones.some((zone)=>zone.sourceId===sourceId)) zones.push({projectId:ctx.projectId,sourceId,directory:join(root,'inbox'),stateFile:join(root,'register.json'),rulesFile,pollMs:25,
      landing:{name:sourceName,credentialRef,strategy:'append_as_at'}});
    const updated = {...original,demo:{database:'opintel_demo',credentialRef},receiptUrl:config.receiptUrl ?? 'https://127.0.0.1:3101',landingZones:zones};
    await writeFile(serviceFile+'.next',JSON.stringify(updated,null,2)+'\n',{mode:0o600}); await rename(serviceFile+'.next',serviceFile);
    console.info(`Prepared demo source ${sourceId}. Restart the sidecar with dev:up, start dev:api, then run demo:pack provision with this source ID.`);
    return;
  }
  const { config } = await loadSidecarConfig(serviceFile);
  const zone = config.landingZones?.find((entry)=>entry.projectId===ctx.projectId && entry.sourceId===sourceId);
  if (!zone?.landing) throw new Error('Prepare this source before provisioning.');
  const { SidecarSourceConnector, loadSidecarClientOptions, IntrospectionJob, PostgresIntrospectionStore } = await import('../src/modules/sources/index.js');
  const options = await loadSidecarClientOptions(process.env.SIDECAR_CLIENT_CONFIG ?? join(sidecarDevDirectory,'client.json'));
  const connector = new SidecarSourceConnector('postgres',{...ctx,sourceId,requestId:randomUUID(),sampling:async()=>({ok:true,value:{consentGiven:false,elements:[]}})},options);
  const provisioned = await connector.provisionDemo(zone.landing.credentialRef,provisionDemoPayload.parse({templateId,schemaSpec:template.schemaSpec,generatorSpec:template.generatorSpec,landingZone:zone.directory}));
  if (!provisioned.ok) throw provisioned.error;
  // Wait for ordinary arrival notices, not a demo-only ingestion shortcut.
  const deadline = Date.now()+60000;
  while (true) {
    const [row] = await withTenant(ctx,(tx)=>tx.query<{count:number}>(`SELECT count(*)::int AS count FROM arrival_notice WHERE source_id=$1 AND payload->>'outcome' IN ('landed','quarantined','duplicate')`,[sourceId]));
    if ((row?.count ?? 0) >= (template.generatorSpec.files?.length ?? 0)) break;
    if (Date.now()>deadline) throw new Error('Files remain pending. Inspect the local register and retry provisioning; delivered files are not replaced.');
    await delay(100);
  }
  const job = new IntrospectionJob(new PostgresIntrospectionStore(new UuidV7IdFactory()),()=>connector);
  const queued = await job.enqueue(ctx,sourceId,[zone.landing.name]); if (!queued.ok) throw queued.error;
  const result = await job.execute(ctx,queued.value.id); if (!result.ok) throw result.error;
  if (result.value.state !== 'complete') throw new Error('Ordinary source introspection did not complete.');
  console.info(`Demo source ${sourceId} provisioned and catalogued. Inspect its register for the intentionally quarantined filing.`);
}
void main().catch(() => { console.error('Demo command failed. Check the project, source, configured Vault reference, running API/sidecar and local register. No existing arrivals were replaced.'); process.exitCode=1; });
