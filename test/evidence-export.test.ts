import {EvidenceMaintenance} from '../src/modules/evidence/index.js';
import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {parse} from 'csv-parse/sync';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {ok} from '../src/shared/kernel/index.js';
import {unwrap} from './fixtures/policy-version/fixture.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {exportFixture,type ExportFixture} from './fixtures/evidence-export/fixture.js';
import {EvidenceExportDescriptor,EvidenceExportRecord,evidenceExportOpenApiDocument} from '../src/shared/api/evidence-export.js';
resetDatabaseBeforeEach('company');let f:ExportFixture;
beforeEach(async()=>{f=await exportFixture();});afterEach(async()=>{await f.close();});
it('M-009/M-010: export filters runs, excludes demo runs and derived deliveries, preserves incomplete provenance and refusal facts',async()=>{
 const real=await f.run(false),demo=await f.run(true),incomplete=await f.run(null);await f.run(false,'other','prompt','other-agent');
 const link=await f.link({format:'ndjson',filters:{poolId:f.pool,agentId:'export-agent',mode:'query',from:new Date(Date.now()-60000).toISOString(),to:new Date(Date.now()+60000).toISOString()}});
 const response=await fetch(f.base+link.downloadUrl);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('content-type')).toContain('application/x-ndjson');
 const records=(await response.text()).trim().split('\n').map(line=>EvidenceExportRecord.parse(JSON.parse(line)));expect(records.map(r=>r.id).sort()).toEqual([real.id,incomplete.id].sort());expect(records.some(r=>r.id===demo.id)).toBe(false);
 expect(records.find(r=>r.id===incomplete.id)).toMatchObject({status:'incomplete',demoProvenance:'unknown',synthetic:null});
 const completed=records.find(r=>r.id===real.id)!;expect(completed.demoProvenance).toBe('none');expect(completed.elements.map(e=>e.exposedName)).toEqual(['field_1','unknown_field']);expect(completed.versions.policy).toBe(19);
 const filtered=await f.link({format:'ndjson',filters:{outcome:'answered',elementId:f.ids[0]}});expect((await (await fetch(f.base+filtered.downloadUrl)).text()).trim().split('\n')).toHaveLength(2);
 const empty=await f.link({format:'ndjson',filters:{poolId:randomUUID()}});expect(await (await fetch(f.base+empty.downloadUrl)).text()).toBe('');
});
it('redaction is evaluated at download for both formats; CSV quotes embedded delimiters, newlines and quotes',async()=>{
 await f.run(false,'SELECT \'private,"value\nnext\'');await f.settings('none');
 for(const format of ['ndjson','csv'] as const){const link=await f.link({format,filters:{}});f.permissions.unredacted=false;let body=await (await fetch(f.base+link.downloadUrl)).text();expect(body).not.toContain('private');f.permissions.unredacted=true;await f.settings('aggressive');body=await (await fetch(f.base+link.downloadUrl)).text();expect(body).not.toContain('private');await f.settings('allowlist',['sql']);body=await (await fetch(f.base+link.downloadUrl)).text();expect(body).not.toContain('private');expect(body).toContain('[redacted]');await f.settings('none');body=await (await fetch(f.base+link.downloadUrl)).text();if(format==='csv'){const rows:unknown=parse(body,{columns:true});expect(rows).toMatchObject([{request:'SELECT \'private,"value\nnext\'',elements:expect.stringContaining('field_1')}]);}else expect(EvidenceExportRecord.parse(JSON.parse(body)).request).toBe('SELECT \'private,"value\nnext\'');}
});
it('creation is idempotent; links require current export permission, the owner, a valid signature and expiry',async()=>{
 const key=randomUUID(),command={format:'ndjson' as const,filters:{}};
 const [first,retry]=await Promise.all([f.post(command,key),f.post(command,key)]);expect(first.status).toBe(201);const descriptor=EvidenceExportDescriptor.parse(await first.json());expect(await retry.json()).toEqual(descriptor);expect(await (await f.post(command,key)).json()).toEqual(descriptor);expect((await f.post({...command,format:'csv'},key)).status).toBe(409);
 const status=await f.status(descriptor.id);const link=await status.json() as {downloadUrl:string};
 f.permissions.export=false;expect((await fetch(f.base+link.downloadUrl)).status).toBe(403);expect((await f.status(descriptor.id)).status).toBe(403);f.permissions.export=true;
 const validUrl=new URL(f.base+link.downloadUrl);const clock=vi.spyOn(Date,'now').mockReturnValue(Number(validUrl.searchParams.get('expires'))+1);try{const expired=await fetch(validUrl);expect(expired.status).toBe(403);expect(await expired.text()).toContain('has expired');}finally{clock.mockRestore();}
 const bad=new URL(f.base+link.downloadUrl);bad.searchParams.set('signature','0'.repeat(64));expect((await fetch(bad)).status).toBe(403);bad.searchParams.set('expires','1');expect((await fetch(bad)).status).toBe(403);
 const wrongProject=new URL(f.base+link.downloadUrl);wrongProject.searchParams.set('projectId',randomUUID());expect((await fetch(wrongProject)).status).toBe(404);
 await withTenant(f.ctx,tx=>tx.query("UPDATE evidence_export_request SET expires_at=clock_timestamp()-interval '1 second' WHERE request_key=$1",[key]));const renewed=EvidenceExportDescriptor.parse(await (await f.post(command,key)).json());expect(renewed.id).not.toBe(descriptor.id);
 f.otherActor();expect((await fetch(f.base+link.downloadUrl)).status).toBe(404);expect((await f.status(descriptor.id)).status).toBe(404);
 expect(evidenceExportOpenApiDocument().paths['/exports/{id}/download'].get.responses[200].content).toHaveProperty('application/x-ndjson');
});
it('page boundaries recheck export permission and redaction, and stop without fetching after cancellation',async()=>{
 const sample=await f.run(false);await f.settings('none');const link=await f.link({format:'ndjson',filters:{}});
 const original=f.repository.page.bind(f.repository);const first=unwrap(await original(f.ctx,link,null,1));expect(first[0]?.id).toBe(sample.id);
 let pages=0;f.repository.page=async()=>{pages++;return ok(Array.from({length:100},()=>first[0]!));};
 const controller=new AbortController();const rows=f.service.records(f.ctx,link,controller.signal);for(let i=0;i<100;i++){const row=await rows.next();expect(row.value).toMatchObject({ok:true,value:{argumentVisibility:'raw'}});}
 f.permissions.unredacted=false;expect((await rows.next()).value).toMatchObject({ok:true,value:{request:null,argumentVisibility:'hidden'}});expect(pages).toBe(2);controller.abort();expect((await rows.next()).done).toBe(true);expect(pages).toBe(2);
 pages=0;f.permissions.export=true;const next=f.service.records(f.ctx,link,new AbortController().signal);for(let i=0;i<100;i++)await next.next();f.permissions.export=false;expect((await next.next()).value).toMatchObject({ok:false,error:{code:'forbidden'}});expect(pages).toBe(1);expect((await next.next()).done).toBe(true);
});
it('CSV neutralizes spreadsheet formulas in observational identifiers; filters cannot opt into synthetic runs',async()=>{
 await f.run(false,'SELECT 1','query','=HYPERLINK("https://example.invalid")');const link=await f.link({format:'csv',filters:{}});const rows:unknown=parse(await (await fetch(f.base+link.downloadUrl)).text(),{columns:true});expect(rows).toMatchObject([{agentId:'\'=HYPERLINK("https://example.invalid")'}]);
 const bad=await fetch(`${f.base}/api/v1/projects/${f.ctx.projectId}/exports`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({format:'ndjson',filters:{includeSynthetic:true}})});expect(bad.status).toBe(400);
});
it('keyset pages preserve all runs with identical timestamps and respect the descriptor header-time bound',async()=>{
 await withTenant(f.ctx,tx=>tx.query(`INSERT INTO query_run(project_id,pool_id,key_prefix,mode,request,versions,started_at)
  SELECT $1,$2,'opk_page','query','SELECT 1','{"policy":1,"catalog":1,"vocabulary":1,"tokenKeyVersionSelected":null}',clock_timestamp()-interval '1 minute' FROM generate_series(1,205)`,[f.ctx.projectId,f.pool]));
 // Matching headers have precisely the same timestamp, including microseconds.
 // A single statement uses transaction_timestamp() for that constant value.
 const key=randomUUID();await withTenant(f.ctx,tx=>tx.query(`INSERT INTO query_run(project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at)
  SELECT $1,$2,$3,'opk_page','query','SELECT 1','{"policy":1,"catalog":1,"vocabulary":1,"tokenKeyVersionSelected":null}',transaction_timestamp()-interval '1 minute' FROM generate_series(1,205)`,[f.ctx.projectId,f.pool,key]));
 await withTenant(f.ctx,tx=>tx.query(`INSERT INTO query_run(project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'opk_future','query','SELECT 1','{"policy":1,"catalog":1,"vocabulary":1,"tokenKeyVersionSelected":null}',clock_timestamp()+interval '1 minute')`,[f.ctx.projectId,f.pool,key]));
 const link=await f.link({format:'ndjson',filters:{agentId:key}});const rows=(await (await fetch(f.base+link.downloadUrl)).text()).trim().split('\n').map(line=>EvidenceExportRecord.parse(JSON.parse(line)));
 expect(rows).toHaveLength(205);expect(new Set(rows.map(r=>r.id)).size).toBe(205);expect(new Set(rows.map(r=>r.startedAt)).size).toBe(1);expect(rows.map(r=>r.id)).toEqual(rows.map(r=>r.id).sort().reverse());
});

it('5.17: both export formats identify rollups and exclude derived deliveries from summary counts',async()=>{
 await withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{fullRetentionDays:1,rollupRetentionDays:1}}]));
 const id=randomUUID();await withTenant(f.ctx,async tx=>{
  const [r]=await tx.query<{at:string}>("INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'test','query','SELECT 1','{\"policy\":1,\"catalog\":1,\"vocabulary\":1,\"tokenKeyVersionSelected\":null}',clock_timestamp()-interval '2 days') RETURNING started_at::text AS at",[id,f.ctx.projectId,f.pool]);
  for(const element of [f.ids[0],null])await tx.query("INSERT INTO run_element(run_id,started_at,element_id,exposed_name,state,treatment) VALUES($1,$2,$3,'field','released','clear')",[id,r!.at,element]);
  await tx.query("INSERT INTO run_completion(run_id,started_at,outcome,completed_at) VALUES($1,$2,'{\"kind\":\"answered\",\"rowCount\":1,\"truncated\":false}',$2)",[id,r!.at]);
 });
 unwrap(await new EvidenceMaintenance().project(f.ctx.projectId));
 for(const format of ['ndjson','csv'] as const){const link=await f.link({format,filters:{}}),body=await(await fetch(f.base+link.downloadUrl)).text();
  if(format==='ndjson')expect(EvidenceExportRecord.parse(JSON.parse(body))).toMatchObject({id,recordKind:'rollup',treatmentCounts:{clear:1},elements:[],request:null});
  else expect(parse(body,{columns:true})).toMatchObject([{id,recordKind:'rollup',treatmentCounts:'{"clear":1}',elements:'[]'}]);
 }
});

it.each((['ndjson','csv'] as const).flatMap(format=>['provider changed','credential revoked','legacy alias grace ended'].map(reason=>[format,reason] as const)))('%s evidence export must not silently omit persisted release events (%s)',async(format,reason)=>{
 // Receipt/export identity remains the internal alias, never the external certificate recipient.
 const run=await f.run(false),grant=randomUUID(),alias=`agent:${f.ctx.projectId}:${randomUUID()}`,iat=Math.floor(Date.now()/1000);
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 await withTenant(f.ctx,async tx=>{
  const claims={iss:f.ctx.projectId,sub:alias,aud:'local',jti:grant,iat,exp:iat+600,rcpt:run.id,cols:['field_1'],custody:{provider:'local',tenant:'local',locator:'export-test',provider_redeem_at:'https://provider.invalid',opintel_redeem_at:'https://opintel.invalid'}};
  await tx.query("INSERT INTO release_grant(id,project_id,scope_user_id,receipt_id,claims,grant_jws,expires_at,share,state,escrow_revoked) VALUES($1,$2,$3,$4,$5,'a.b.c',to_timestamp($6),NULL,'redeemed',false)",[grant,f.ctx.projectId,f.ctx.userId,run.id,claims,iat+600]);
  for(const kind of ['granted','redeemed','expired','revoked','provider_redeemed'])await tx.query("INSERT INTO release_event(project_id,grant_id,receipt_id,kind,reason,occurred_at,alias,actor,jur_observed) VALUES($1,$2,$3,$4,$5,clock_timestamp(),$6,$6,'test-origin')",[f.ctx.projectId,grant,run.id,kind,kind==='revoked'?reason:null,alias]);
 });
  const link=await f.link({format,filters:{}}),body=await (await fetch(f.base+link.downloadUrl)).text();
  const events:unknown=format==='ndjson'?EvidenceExportRecord.parse(JSON.parse(body)).releaseEvents:JSON.parse((parse(body,{columns:true}) as Array<{releaseEvents:string}>)[0]!.releaseEvents);
  expect(events).toEqual(expect.arrayContaining(['granted','redeemed','expired','revoked','provider_redeemed'].map(kind=>expect.objectContaining({grantId:grant,receipt:run.id,kind,alias,reason:kind==='revoked'?reason:null}))));
  expect(events).toHaveLength(5);
});

it('E09-005: CSV and NDJSON normalize historical row counts without rewriting recorded evidence',async()=>{
 const identity={objectId:randomUUID(),objectName:'records',poolId:f.pool,decisionId:randomUUID(),hash:'b'.repeat(64),columns:['id'],provenance:'agent credential',missingDecision:false};
 const facts=[{...identity,entitledRows:1},{...identity,returnedRows:1}];
 for(const fact of facts){const run=await f.run(null);await withTenant(f.ctx,tx=>tx.query('INSERT INTO run_completion(run_id,started_at,outcome,synthetic,completed_at,source_plan) VALUES($1,$2,$3,false,$2,$4)',[run.id,run.at,{kind:'answered',rowCount:1,truncated:false},{rowScopes:[fact]}]));}
 for(const format of ['ndjson','csv'] as const){
  const link=await f.link({format,filters:{}}),text=await (await fetch(f.base+link.downloadUrl)).text();
  const scopes=format==='ndjson'?text.trim().split('\n').map(line=>EvidenceExportRecord.parse(JSON.parse(line)).metadata.rowScopes):
   (parse(text,{columns:true}) as {metadata:string}[]).map(row=>(JSON.parse(row.metadata) as {rowScopes:unknown}).rowScopes);
  expect(scopes).toEqual([[{...identity,returnedRows:1}],[{...identity,returnedRows:1}]]);expect(text).not.toContain('entitledRows');
 }
 const stored=await withTenant(f.ctx,tx=>tx.query<{source_plan:{rowScopes:unknown[]}}>('SELECT source_plan FROM run_completion ORDER BY started_at'));
 expect(stored.map(r=>r.source_plan.rowScopes)).toEqual(facts.map(fact=>[fact]));
});
