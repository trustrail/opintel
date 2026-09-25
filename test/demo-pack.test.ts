import { z } from 'zod';
import { filingSchema, type WatchedFiling } from '../sidecar/ingest/register.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { DemoSourceId, IndustryId, ProjectId, SourceId, UserId, UuidV7IdFactory, ok, type Result } from '../src/shared/kernel/index.js';
import { EnvironmentSecretStore, SecretRef } from '../src/platform/secrets/index.js';
import { generatorSpecSchema, provisionDemoPayload } from '../src/shared/demo-contract.js';
import { demoIdentification } from '../src/modules/sources/demo/metadata.js';
import { readDemoTemplate } from '../src/modules/sources/demo/templates.js';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { loadSidecarClientOptions, SidecarSourceConnector, IntrospectionJob, PostgresIntrospectionStore } from '../src/modules/sources/index.js';
import { createSidecarServer } from '../sidecar/http/server.js';
import { createPostgresConnector } from '../sidecar/create-postgres-connector.js';
import { SpreadsheetDemoProvisioner } from '../sidecar/demo/provision.js';
import { DemoWorkbookWriter } from '../sidecar/demo/infrastructure/workbook-writer.js';
import { generateRows } from '../sidecar/demo/generate.js';
import { LandingWatcher, type LandingZone } from '../sidecar/ingest/watch.js';
import { SpreadsheetExtractor } from '../sidecar/ingest/extract.js';
import { LocalWorkbookReader } from '../sidecar/ingest/infrastructure/workbook-reader.js';
import { FilingLander } from '../sidecar/ingest/land.js';
import { PostgresLanding } from '../sidecar/ingest/infrastructure/postgres-landing.js';
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
const templateId = DemoSourceId('31100000-0000-4000-8000-000000000001');
let directory: string;
let watcher: LandingWatcher | undefined;
let host: ReturnType<typeof createSidecarServer> | undefined;
const sourceId = SourceId(randomUUID());
const ctx = { projectId: ProjectId(randomUUID()), userId: UserId(randomUUID()) };
const credentialRef = SecretRef('secret://demo/postgres');
const secrets = new EnvironmentSecretStore({ OPINTEL_SECRET_DEMO_POSTGRES: process.env.TEST_DATABASE_URL });
async function customer<T>(work: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
  try { return await work(db); } finally { await db.end(); }
}

describe('reinsurance demo pack through ordinary ingest', () => {
 resetDatabaseBeforeEach('company', 'industry');
 beforeAll(async () => { directory = await mkdtemp(join(tmpdir(),'opintel-demo-')); await prepareSidecarDevelopment(directory); });
 afterAll(async () => {
  await watcher?.close(); await host?.close();
  await customer(async (db) => {
   const result = await db.query<{schema_name:string}>('SELECT schema_name FROM _opintel_landing.sources WHERE source_id=$1',[sourceId]);
   for (const row of result.rows) await db.query(`DROP SCHEMA "${row.schema_name.replaceAll('"','""')}" CASCADE`);
   for (const table of ['commits','groups','sources']) await db.query(`DELETE FROM _opintel_landing.${table} WHERE source_id=$1`,[sourceId]);
  });
  await rm(directory,{recursive:true,force:true}); vi.restoreAllMocks();
 });
 it('provisions twelve inconsistent parties, quarantines a merged header, preserves a restatement, and calls the customer SourceConnector port', async () => {
  const industry = await withPlatform(async (tx) => {
   const [industry] = await tx.query<{id:string}>("SELECT id FROM industry WHERE slug='reinsurance-treaty'");
   const [company] = await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Demo pack','eu-west-1') RETURNING id");
   await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,'Demo pack','eu-west-1')",[ctx.projectId,company!.id,industry!.id]);
   return IndustryId(industry!.id);
  });
  const template = unwrap(await readDemoTemplate(industry,templateId));
  const published = JSON.parse(await readFile('src/modules/sources/demo/reinsurance.json','utf8')) as Record<string,unknown>;
  expect(template.schemaSpec).toEqual(published.schemaSpec); expect(template.generatorSpec).toEqual(published.generatorSpec);
  const files = template.generatorSpec.files!;
  expect(new Set(files.map((file) => file.party)).size).toBe(12);
  expect(new Set(files.map((file) => file.sheetName)).size).toBeGreaterThan(1);
  expect(new Set(files.map((file) => file.headerRow)).size).toBeGreaterThan(1);
  expect(new Set(files.map((file) => file.decimalSeparator)).size).toBe(2);
  expect(new Set(files.map((file) => file.dateFormat)).size).toBe(3);
  const metadata = demoIdentification(ctx.projectId,sourceId,template.generatorSpec);
  const nativeId = SourceId(randomUUID());
  await withTenant(ctx,async (tx) => {
   await tx.query(`INSERT INTO data_source(id,project_id,kind,origin,demo_template_id,name,exposed_alias,credential_ref,receives_landings,landing_strategy)
    VALUES($1,$2,'postgres','demo',$3,'Demo','demo',$4,true,'append_as_at'),($5,$2,'postgres','customer',NULL,'Customer','customer',$4,false,NULL)`,[sourceId,ctx.projectId,templateId,credentialRef,nativeId]);
  });
  // Tenant-owned deployment metadata, through the same scopes as customer rules.
  for (const party of metadata.filingParties) await withTenant(ctx,async (tx) => {
   await tx.query('INSERT INTO filing_party(id,project_id,code,name,decimal_separator,date_format) VALUES($1,$2,$3,$4,$5,$6)',[party.id,ctx.projectId,party.code,party.name,party.decimalSeparator,party.dateFormat]);
   for (const rule of metadata.rules.filter((rule) => rule.partyId===party.id)) await tx.query(`INSERT INTO filing_party_rule(id,project_id,party_id,match_kind,pattern,kind,period_group,priority,sheet,header_row,period_as_at_format)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[rule.id,ctx.projectId,rule.partyId,rule.matchKind,rule.pattern,rule.kind,rule.periodGroup,rule.priority,rule.sheet,rule.headerRow,rule.periodAsAtFormat]);
  });
  const zone: LandingZone = { projectId:ctx.projectId,sourceId,directory:join(directory,'zone'),stateFile:join(directory,'state.json'),rulesFile:join(directory,'rules.json'),pollMs:10,
   landing:{name:`demo_${sourceId.replaceAll('-','')}`,credentialRef,strategy:'append_as_at'} };
  await mkdir(zone.directory); await writeFile(zone.rulesFile,JSON.stringify(metadata));
  const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
  const writer = new PostgresLanding(secrets);
  const landingSpy = vi.spyOn(writer,'land');
  const extractorSpy = vi.spyOn(extractor,'inspect');
  const storeSpy = vi.spyOn(secrets,'store');
  watcher = await LandingWatcher.open(zone,undefined,extractor,new FilingLander(zone.directory,{...zone.landing!,sourceId,projectId:ctx.projectId},writer,extractor,{send:async()=>ok(undefined)}));
  // Hold the cache update after durable persistence until the dependent write.
  // This deterministically reproduces the scheduling gap found under suite load.
  let releaseCache = () => {};
  const cacheGate = new Promise<void>(resolve => { releaseCache = resolve; });
  const register = watcher as unknown as { persist(filings: readonly WatchedFiling[]): Promise<void> };
  const persist = register.persist.bind(register);
  const delayedPersist = vi.spyOn(register,'persist').mockImplementation(async filings => {
   await persist(filings);
   if (filings.length === 1) await cacheGate;
  });
  let observedStaleCache = false;
  const workbook = new DemoWorkbookWriter();
  const workbookWrite = workbook.write.bind(workbook);
  const workbookSpy = vi.spyOn(workbook,'write').mockImplementation(async (...args) => {
   const file = args[1];
   if (file.dependsOn) {
    try {
     const durable = z.object({filings:z.array(filingSchema)}).parse(JSON.parse(await readFile(zone.stateFile,'utf8')) as unknown);
     expect(durable.filings).toEqual(expect.arrayContaining([expect.objectContaining({ path:`${file.dependsOn}_${file.period}.xlsx` })]));
     observedStaleCache = watcher!.records().length === 0;
    } finally { releaseCache(); }
   }
   return workbookWrite(...args);
  });
  const provision = new SpreadsheetDemoProvisioner([zone],{database:new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1),credentialRef},workbook);
  const { config,tls } = await loadSidecarConfig(join(directory,'service.json'));
  host = createSidecarServer({config:{...config,port:0},tls,connector:createPostgresConnector({secrets,audit:{record:async()=>undefined},limits:config.limits}),demo:provision});
  const port = await host.listen();
  const options = await loadSidecarClientOptions(join(directory,'client.json')); options.baseUrl=`https://127.0.0.1:${port}`;
  const connector = (id: SourceId) => new SidecarSourceConnector('postgres',{sourceId:id,projectId:ctx.projectId,requestId:randomUUID(),sampling:async()=>ok({consentGiven:false,elements:[]})},options);
  const demo = connector(sourceId); const native = connector(nativeId);
  const payload = provisionDemoPayload.parse({templateId,schemaSpec:template.schemaSpec,generatorSpec:template.generatorSpec,landingZone:zone.directory});
  expect(await demo.provisionDemo(credentialRef,{...payload,landingZone:directory})).toMatchObject({ok:false});
  expect(await readdir(zone.directory)).toEqual([]);
  // A new project or template read alone never provisions anything (E2-013).
  const pending = demo.provisionDemo(credentialRef,payload);
  await expect.poll(() => workbookSpy.mock.calls.length).toBe(12);
  expect((await readdir(zone.directory)).some((name) => name.includes('restatement'))).toBe(false);
  watcher.start();
  try {
   expect(unwrap(await pending)).toEqual({credentialRef,database:new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1)});
   expect(observedStaleCache).toBe(true);
  } finally { releaseCache(); delayedPersist.mockRestore(); }
  await expect.poll(() => watcher!.records().filter((filing) => filing.landing?.registered).length,{timeout:15000}).toBe(12);
  // Twelve landings do not imply the thirteenth (quarantined) file has settled.
  await watcher.scan();
  const records = watcher.records(); expect(records).toHaveLength(13);
  expect(records.filter((record) => record.status==='quarantined')).toEqual([expect.objectContaining({reason:'The declared header row contains a merged cell.'})]);
  expect(workbookSpy).toHaveBeenCalledTimes(13); expect(landingSpy).toHaveBeenCalledTimes(12); expect(extractorSpy).toHaveBeenCalled(); expect(storeSpy).not.toHaveBeenCalled();
  const first = records.find((record) => record.path.startsWith('cedant_01_original'))!;
  const second = records.find((record) => record.path.startsWith('cedant_01_restatement'))!;
  expect(second.supersedes).toBe(first.id);
  expect(second.landing!.receipt.landedTable).toBe(first.landing!.receipt.landedTable);
  const totals = await customer(async (db) => (await db.query(`SELECT _opintel_filing_id AS id,sum("Written Premium")::text AS total FROM ${first.landing!.receipt.landedTable} GROUP BY _opintel_filing_id`)).rows as Array<{id:string;total:string}>);
  expect(totals.find((row)=>row.id===first.id)!.total).not.toBe(totals.find((row)=>row.id===second.id)!.total);

  const quantities = await customer(async (db) => (await db.query(`SELECT _opintel_filing_id AS id,count(*)::int AS rows FROM ${first.landing!.receipt.landedTable} GROUP BY _opintel_filing_id ORDER BY id`)).rows as Array<{id:string;rows:number}>);
  expect(quantities).toEqual([{id:first.id,rows:12},{id:second.id,rows:12}].sort((a,b)=>a.id.localeCompare(b.id)));
  await watcher.close(); watcher=undefined;
  const local = await readFile(zone.stateFile,'utf8');
  expect(unwrap(await demo.provisionDemo(credentialRef,payload))).toBeDefined();
  expect(await readFile(zone.stateFile,'utf8')).toBe(local); expect(workbookSpy).toHaveBeenCalledTimes(13);
  const delivery = join(zone.directory,first.path);
  const original = await readFile(delivery);
  await writeFile(delivery,'operator correction');
  expect(await demo.provisionDemo(credentialRef,payload)).toMatchObject({ok:false});
  expect(await provision.provision({requestId:randomUUID(),projectId:ctx.projectId,sourceId,credentialRef,payload})).toMatchObject({ok:false,error:{code:'conflict'}});
  await writeFile(delivery,original);
  // E2-014: assertions are on the real application port, not merely snapshots.
  const demoCheck = vi.spyOn(demo,'testConnection'); const demoIntrospect = vi.spyOn(demo,'introspect');
  const nativeCheck = vi.spyOn(native,'testConnection'); const nativeIntrospect = vi.spyOn(native,'introspect');
  const choose = vi.fn((source: {id:SourceId}) => source.id===sourceId ? demo : native);
  const job = new IntrospectionJob(new PostgresIntrospectionStore(new UuidV7IdFactory()),choose);
  for (const id of [sourceId,nativeId]) {
   const queued = unwrap(await job.enqueue(ctx,id,[zone.landing!.name]));
   expect(unwrap(await job.execute(ctx,queued.id)).state).toBe('complete');
  }
  for (const spy of [demoCheck,nativeCheck]) expect(spy).toHaveBeenCalledExactlyOnceWith(credentialRef,expect.any(AbortSignal));
  for (const spy of [demoIntrospect,nativeIntrospect]) expect(spy).toHaveBeenCalledExactlyOnceWith(credentialRef,[zone.landing!.name],expect.any(AbortSignal));
  expect(choose).toHaveBeenCalledTimes(2);
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(project_id,name) VALUES($1,'Demo readers')",[ctx.projectId]));
  expect(await withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement'))).toEqual([]);
  const undecided=await withTenant(ctx,tx=>tx.query<{source_id:string;elements:number;undecided:number}>(`SELECT o.source_id,count(*)::int AS elements,count(*) FILTER (WHERE NOT EXISTS(SELECT 1 FROM entitlement t WHERE t.element_id=e.id))::int AS undecided FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id GROUP BY o.source_id ORDER BY o.source_id`));
  expect(undecided).toHaveLength(2);
  for(const row of undecided){expect(row.elements).toBeGreaterThan(0);expect(row.undecided).toBe(row.elements);}
  expect(await withTenant(ctx,(tx)=>tx.query('SELECT DISTINCT source_id FROM catalog_object ORDER BY source_id'))).toEqual([sourceId,nativeId].sort().map((source_id)=>({source_id})));
 },30000);
});

it('validates file dependency identity and generates repeatable values and cross-object join keys', async () => {
 const raw = JSON.parse(await readFile('src/modules/sources/demo/reinsurance.json','utf8')) as Record<string,unknown>;
 const pack = provisionDemoPayload.parse({schemaSpec:raw.schemaSpec,generatorSpec:raw.generatorSpec,templateId,landingZone:'/zone'});
 const files = pack.generatorSpec.files!;
 const object = pack.schemaSpec.schemas[0]!.objects[0]!;
 const one = generateRows(pack.generatorSpec,files[0]!,object);
 expect(generateRows(pack.generatorSpec,files[0]!,object)).toEqual(one);
 const two = generateRows(pack.generatorSpec,files[1]!,pack.schemaSpec.schemas[0]!.objects[1]!);
 expect(two.map((row)=>row[0])).toEqual(one.map((row)=>row[0]));
 expect(one[0]![1]).toMatch(/^\d\.\d{3},\d{2}$/);
 expect(generatorSpecSchema.safeParse({...pack.generatorSpec,files:[{...files[0],dependsOn:'missing'}]}).success).toBe(false);
 expect(generatorSpecSchema.safeParse({...pack.generatorSpec,files:[files[0],files[0]]}).success).toBe(false);
});

it('forward demo credential migration rejects NULL/plaintext, preserves references, and rolls up/down/up', async () => {
 const db = new Client({connectionString:process.env.TEST_DATABASE_URL}); await db.connect();
 try {
  await db.query('BEGIN'); const schema='demo_migration_'+randomUUID().replaceAll('-','');
  await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}",public`);
  await db.query(`CREATE TABLE data_source(origin text,credential_ref text,demo_template_id uuid,
   CONSTRAINT credential_matches_origin CHECK ((origin='customer' AND credential_ref IS NOT NULL AND credential_ref LIKE 'vault://%') OR (origin='demo' AND credential_ref IS NULL AND demo_template_id IS NOT NULL)))`);
  await db.query("INSERT INTO data_source VALUES('customer','vault://test/kept',NULL),('demo',NULL,$1)",[templateId]);
  const up=await readFile('migrations/023_demo_credentials.up.sql','utf8');
  const down=await readFile('migrations/023_demo_credentials.down.sql','utf8');
  await db.query('SAVEPOINT legacy'); await expect(db.query(up)).rejects.toThrow('requires backfill'); await db.query('ROLLBACK TO SAVEPOINT legacy');
  expect((await db.query("SELECT credential_ref FROM data_source WHERE origin='demo'")).rows).toEqual([{credential_ref:null}]);
  await db.query("DELETE FROM data_source WHERE origin='demo'"); await db.query(up);
  for(const origin of ['customer','demo']) for(const value of [null,'postgres://plaintext']) {
   await db.query('SAVEPOINT invalid');
   await expect(db.query('INSERT INTO data_source VALUES($1,$2,$3)',[origin,value,templateId])).rejects.toMatchObject({code:'23514'});
   await db.query('ROLLBACK TO SAVEPOINT invalid');
  }
  await db.query("INSERT INTO data_source VALUES('demo','vault://demo/real',$1)",[templateId]);
  await db.query('SAVEPOINT live'); await expect(db.query(down)).rejects.toMatchObject({code:'23514'}); await db.query('ROLLBACK TO SAVEPOINT live');
  expect((await db.query("SELECT credential_ref FROM data_source WHERE origin='demo'")).rows).toEqual([{credential_ref:'vault://demo/real'}]);
  await db.query("DELETE FROM data_source WHERE origin='demo'"); await db.query(down); await db.query(up);
  expect((await db.query('SELECT credential_ref FROM data_source')).rows).toEqual([{credential_ref:'vault://test/kept'}]);
  await db.query('CREATE TABLE industry(id uuid PRIMARY KEY,slug text); CREATE TABLE demo_source_template(id uuid PRIMARY KEY,industry_id uuid,name text,kind text,narrative text,schema_spec jsonb,generator_spec jsonb,pack_version int)');
  await db.query("INSERT INTO industry VALUES($1,'reinsurance-treaty')",[randomUUID()]);
  const seed=await readFile('migrations/024_reinsurance_demo_pack.up.sql','utf8');const unseed=await readFile('migrations/024_reinsurance_demo_pack.down.sql','utf8');
  await db.query(seed); await db.query(unseed); await db.query(seed);
  expect((await db.query('SELECT id FROM demo_source_template')).rows).toEqual([{id:templateId}]);
 } finally { await db.query('ROLLBACK'); await db.end(); }
}, 30_000);
