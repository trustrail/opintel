import JSZip from 'jszip';
import {canonicalWorkbook} from '../scripts/verification/workbooks/infrastructure/workbook-writer.js';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {it,expect} from 'vitest';
import {ProjectId,SourceId,ok} from '../src/shared/kernel/index.js';
import {EnvironmentSecretStore,SecretRef} from '../src/platform/secrets/index.js';
import {writeWorkbooks} from '../scripts/verification/workbooks/write.js';
import {generateRows} from '../scripts/verification/workbooks/generate.js';
import {schemaSpecSchema,generatorSpecSchema} from '../scripts/verification/workbooks/contract.js';
import {demoIdentification} from '../scripts/verification/filing-rules.js';
import {LandingWatcher,type LandingZone} from '../sidecar/ingest/watch.js';
import {SpreadsheetExtractor} from '../sidecar/ingest/extract.js';
import {LocalWorkbookReader} from '../sidecar/ingest/infrastructure/workbook-reader.js';
import {FilingLander} from '../sidecar/ingest/land.js';
import {PostgresLanding} from '../sidecar/ingest/infrastructure/postgres-landing.js';
import raw from '../scripts/verification/reinsurance.json' with {type:'json'};
it('standalone workbooks are deterministic with all header/locale variants and ordinary ingest holds a merged header and retains restatement',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'opintel-workbooks-')),projectId=ProjectId(randomUUID()),sourceId=SourceId(randomUUID());
 const ref=SecretRef('secret://test/workbooks'),secrets=new EnvironmentSecretStore({OPINTEL_SECRET_TEST_WORKBOOKS:process.env.TEST_DATABASE_URL});
 const generator=generatorSpecSchema.parse(raw.generatorSpec),schema=schemaSpecSchema.parse(raw.schemaSpec),files=generator.files!;
 expect(new Set(files.map(f=>f.party)).size).toBe(12);expect(new Set(files.map(f=>f.sheetName)).size).toBeGreaterThan(1);expect(new Set(files.map(f=>f.headerRow)).size).toBeGreaterThan(1);expect(new Set(files.map(f=>f.decimalSeparator)).size).toBe(2);expect(new Set(files.map(f=>f.dateFormat)).size).toBe(3);
 const zone:LandingZone={projectId,sourceId,directory:join(directory,'inbox'),stateFile:join(directory,'state.json'),rulesFile:join(directory,'rules.json'),pollMs:10,landing:{name:'files_'+sourceId.replaceAll('-',''),credentialRef:ref,strategy:'append_as_at'}};
 await mkdir(zone.directory);await writeFile(zone.rulesFile,JSON.stringify(demoIdentification(projectId,sourceId,generator)));
 const extractor=new SpreadsheetExtractor(new LocalWorkbookReader()),landing=new PostgresLanding(secrets);
 const watcher=await LandingWatcher.open(zone,undefined,extractor,new FilingLander(zone.directory,{...zone.landing!,projectId,sourceId},landing,extractor,{send:async()=>ok(undefined)}));
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{
  const paths=await writeWorkbooks(join(directory,'generated')),second=await writeWorkbooks(join(directory,'second'));
  for(let i=0;i<paths.length;i++){const bytes=await readFile(paths[i]!);expect(bytes).toEqual(await readFile(second[i]!));for(const entry of Object.values((await JSZip.loadAsync(bytes)).files))expect(entry.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');}
  // Deliver through the ordinary file path. Restatements follow their original.
  for(const path of paths){await writeFile(join(zone.directory,path.split('/').at(-1)!),await readFile(path));await watcher.scan();await watcher.scan();}
  const records=watcher.records();expect(records).toHaveLength(13);expect(records.filter(r=>r.status==='quarantined')).toEqual([expect.objectContaining({reason:'The declared header row contains a merged cell.'})]);expect(records.filter(r=>r.landing?.registered)).toHaveLength(12);
  const first=records.find(r=>r.path.startsWith('cedant_01_original'))!,next=records.find(r=>r.path.startsWith('cedant_01_restatement'))!;
  expect(next.supersedes).toBe(first.id);expect(next.landing!.receipt.landedTable).toBe(first.landing!.receipt.landedTable);
  const totals=await db.query(`SELECT _opintel_filing_id AS id,count(*)::int AS rows,sum("Written Premium")::text AS total FROM ${first.landing!.receipt.landedTable} GROUP BY _opintel_filing_id`);
  expect(totals.rows.map(r=>r.rows)).toEqual([12,12]);expect(totals.rows[0].total).not.toBe(totals.rows[1].total);
 }finally{
  await watcher.close();const schemas=await db.query<{schema_name:string}>('SELECT schema_name FROM _opintel_landing.sources WHERE source_id=$1',[sourceId]);for(const row of schemas.rows)await db.query('DROP SCHEMA "'+row.schema_name.replaceAll('"','""')+'" CASCADE');for(const table of ['commits','groups','sources'])await db.query('DELETE FROM _opintel_landing.'+table+' WHERE source_id=$1',[sourceId]);await db.end();await rm(directory,{recursive:true,force:true});
 }
},60000);
it('retains the generator values, cross-object join keys and dependency validation',()=>{
 const generator=generatorSpecSchema.parse(raw.generatorSpec),schema=schemaSpecSchema.parse(raw.schemaSpec),files=generator.files!,object=schema.schemas[0]!.objects[0]!;
 const one=generateRows(generator,files[0]!,object);expect(generateRows(generator,files[0]!,object)).toEqual(one);expect(generateRows(generator,files[1]!,schema.schemas[0]!.objects[1]!).map(r=>r[0])).toEqual(one.map(r=>r[0]));expect(one[0]![1]).toMatch(/^\d\.\d{3},\d{2}$/);
 expect(generatorSpecSchema.safeParse({...generator,files:[{...files[0],dependsOn:'missing'}]}).success).toBe(false);expect(generatorSpecSchema.safeParse({...generator,files:[files[0],files[0]]}).success).toBe(false);
});
const templateId='31100000-0000-4000-8000-000000000001';
 // Migration round trips are functional; this hang guard allows for growth of the migration chain.
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
}, 60_000);

it('workbook bytes are independent of ZIP wall-clock metadata without changing any part',async()=>{
 const one=new JSZip(),two=new JSZip();
 for(const [name,data] of [['xl/workbook.xml','<workbook>unchanged</workbook>'],['xl/sharedStrings.xml','<sst>same values</sst>']]){one.file(name!,data!,{date:new Date('2030-02-03T04:05:06Z')});two.file(name!,data!,{date:new Date('2040-07-08T09:10:12Z')});}
 const a=await one.generateAsync({type:'nodebuffer'}),b=await two.generateAsync({type:'nodebuffer'});expect(a).not.toEqual(b);
 const canonical=await canonicalWorkbook(a);expect(canonical).toEqual(await canonicalWorkbook(b));const decoded=await JSZip.loadAsync(canonical);
 expect(Object.keys(decoded.files).sort()).toEqual(Object.keys(one.files).sort());for(const [name,file] of Object.entries(one.files))expect(await decoded.files[name]!.async('uint8array')).toEqual(await file.async('uint8array'));
});
