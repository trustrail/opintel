import {QueryOutput} from '../src/shared/api/mcp.js';
import {PostgresElementDeclarations} from '../src/modules/catalog/index.js';
import {PostgresEvidenceReader} from '../src/modules/evidence/index.js';
import {ok,RunId} from '../src/shared/kernel/index.js';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {PostgresEvidenceWriter} from '../src/modules/evidence/index.js';
import {withTenant,withPlatform,withPlatformAdmin} from '../src/platform/db/scope.js';
import {DomainError,err} from '../src/shared/kernel/index.js';
import {queryFixture,unwrap} from './fixtures/query/fixture.js';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(){const writer=new PostgresEvidenceWriter(),f=await queryFixture(writer);cleanup.push(f.close);return {...f,writer};}
async function records(f:Awaited<ReturnType<typeof fixture>>){return withTenant(f.ctx,tx=>tx.query<{id:string;versions:{policy:number;catalog:number;vocabulary:number;tokenKeyVersionSelected:number|null};outcome:{kind:string};used:number|null;synthetic:boolean;source_plan:unknown;freshness:unknown}>(`SELECT r.id,r.versions,c.outcome,c.token_key_version_used AS used,c.synthetic,c.source_plan,c.freshness FROM query_run r LEFT JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.pool_id=$1 ORDER BY r.started_at`,[f.pool]));}
describe('5.11 durable evidence writer',{timeout:60000},()=>{
 it('JOIN-004: early and independent engine refusals persist the attempt with the original statement',async()=>{
  const f=await fixture();await f.addSource('second');
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET token_domain='otherdomain' WHERE object_id IN(SELECT id FROM catalog_object WHERE source_id=(SELECT id FROM data_source WHERE project_id=$1 AND exposed_alias='second')) AND exposed_name='field_2'",[f.ctx.projectId]));
  const reads=vi.spyOn(f.stagingSource,'estimate');
  const sql="SELECT a.field_1, 'JOIN_ATTEMPT_SENTINEL' AS marker FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2";
  for(const authoritative of [false,true]){
   if(authoritative)vi.spyOn(f.filter,'inspect').mockImplementation(async(input,onObject)=>{for(const v of input.views)onObject?.(v);return ok({kind:'requires_sidecar_inspection'});});
   const response=await f.query(sql);expect(response).toMatchObject({isError:true,_meta:{code:'unsupported_on_token',cause:'unsatisfiable_token_join'}});
   expect(JSON.stringify(response)).not.toMatch(/JOIN_ATTEMPT_SENTINEL|otherdomain/);
   const candidates=await withTenant(f.ctx,tx=>tx.query('SELECT * FROM token_join_candidate WHERE project_id=$1 ORDER BY attempted_at',[f.ctx.projectId]));
   expect(candidates).toHaveLength(authoritative?2:1);
   expect(candidates.at(-1)).toMatchObject({statement:sql,agent_id:'unverified-agent',left_name:'warehouse.public.records.field_2',right_name:'second.public.records.field_2',left_element_id:f.ids[1],right_element_id:expect.any(String),attempted_at:expect.any(Date)});
  }
  expect(reads).not.toHaveBeenCalled();expect(f.boundary.executions).toBe(0);
 });
 it('DECL-008: past answers retain key versions and effective declarations after edits and when optional detail is sampled out',async()=>{
  const f=await fixture();const declarations=new PostgresElementDeclarations({canonicalisers:async()=>ok(['stdnum1','stdtime1'])});
  const firstAnswer=await f.query('SELECT field_2 FROM warehouse.public.records');expect(firstAnswer.isError).not.toBe(true);
  const [first]=await records(f);expect(first).toMatchObject({versions:{tokenKeyVersionSelected:1},used:1,source_plan:{tokenDeclarations:[{elementId:f.ids[1],domain:'customer',canonId:'stdnum1',mode:'number',caseInsensitive:false}]}});
  const initial=unwrap(await declarations.read(f.ctx,f.ids[1]!));unwrap(await declarations.save(f.ctx,f.ids[1]!,{...initial.stored,tokenDomain:'revised',confirmation:'Bulk project'}));
  const secondAnswer=await f.query('SELECT field_2 FROM warehouse.public.records');expect(secondAnswer.isError).not.toBe(true);expect(QueryOutput.parse(secondAnswer.structuredContent).rows).not.toEqual(QueryOutput.parse(firstAnswer.structuredContent).rows);
  const rows=await records(f);expect(rows[0]).toEqual(first);expect(rows[1]).toMatchObject({versions:{catalog:first!.versions.catalog+1,tokenKeyVersionSelected:1},used:1,source_plan:{tokenDeclarations:[{domain:'revised'}]}});
  const [timestamp]=await withTenant(f.ctx,tx=>tx.query<{at:string}>('SELECT started_at::text AS at FROM query_run WHERE id=$1',[first!.id]));
  const detail=unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(first!.id),timestamp!.at));expect(detail.tokenDeclarations).toMatchObject([{domain:'customer',canonId:'stdnum1',mode:'number'}]);expect(detail.tokenKeyVersionUsed).toBe(1);
  // Force a legitimate unsampled successful header: the writer must still retain
  // the declarations required to explain tokens, without optional object detail.
  await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{evidence}','{\"captureSamplingPercent\":0.000000001}'::jsonb) WHERE id=$1",[f.ctx.projectId]));
  expect((await f.query('SELECT field_2 FROM warehouse.public.records')).isError).not.toBe(true);
  const last=(await records(f)).at(-1)!;expect(last.source_plan).toEqual({tokenDeclarations:expect.arrayContaining([expect.objectContaining({domain:'revised',canonId:'stdnum1'})])});
 });
 it('Q-037: an in-flight query retains and records the limits pinned at preparation',async()=>{
  const f=await fixture(),execute=f.execution.execute.bind(f.execution);
  const [before]=await withPlatform(tx=>tx.query<{settings:{query:{rowLimit:number}}}>('SELECT settings FROM project WHERE id=$1',[f.ctx.projectId]));
  vi.spyOn(f.execution,'execute').mockImplementation(async(request,...rest)=>{
   await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{query,rowLimit}','1'::jsonb) WHERE id=$1",[f.ctx.projectId]));
   expect(request.limits.rowLimit).toBe(before!.settings.query.rowLimit);return execute(request,...rest);
  });
  expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);
  expect((await records(f))[0]?.source_plan).toMatchObject({executionSettings:{limits:{rowLimit:before!.settings.query.rowLimit}}});
 });
 it('M-002/M-012: persists deliveries, reduction reasons and metadata, with header before source work and completion before release',async()=>{
  const f=await fixture(),estimate=f.stagingSource.estimate.bind(f.stagingSource);const opened=vi.spyOn(f.writer,'open'),closed=vi.spyOn(f.writer,'close');
  vi.spyOn(f.stagingSource,'estimate').mockImplementation(async(...args)=>{const rows=await records(f);expect(rows).toHaveLength(1);expect(rows[0]?.outcome).toBeNull();return estimate(...args);});
  const response=await f.query('SELECT field_1,field_2,field_4 FROM warehouse.public.records ORDER BY field_1',2);
  if(response.isError){await opened.mock.results[0]?.value;await closed.mock.results[0]?.value;}
  expect(response.isError,JSON.stringify(response)).not.toBe(true);
  const [r]=await records(f);expect(r).toMatchObject({outcome:{kind:'reduced',rowCount:2,truncated:true,withheld:1},used:1,synthetic:false,versions:{tokenKeyVersionSelected:1}});
  const elements=await withTenant(f.ctx,tx=>tx.query('SELECT exposed_name,state,treatment,withheld_reason FROM run_element WHERE run_id=$1 ORDER BY exposed_name',[r!.id]));
  expect(elements).toMatchObject([{exposed_name:'field_1',state:'released',treatment:'clear'},{exposed_name:'field_2',state:'released',treatment:'tokenized'},{exposed_name:'field_4',state:'released',treatment:'clear'},{exposed_name:'field_5',state:'withheld',treatment:null,withheld_reason:expect.any(String)},{exposed_name:'field_6',state:'undecided',treatment:null}]);
  expect(r!.freshness).toMatchObject({sources:[{id:f.source,freshnessMode:'live'}]});
  expect(JSON.stringify(r)).not.toContain('WITHHELD_SENTINEL');
 });
 it('M-002: persists masked and aggregate-only deliveries with the actual withholding justification',async()=>{
  const f=await fixture();await withTenant(f.ctx,async tx=>{
   await tx.query("UPDATE entitlement SET treatment='masked',mask_kind='all' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[3]]);
   await tx.query("UPDATE entitlement SET justification='Restricted by data owner' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[4]]);
  });
  expect((await f.query('SELECT field_4 FROM warehouse.public.records')).isError).not.toBe(true);
  expect((await f.query('SELECT SUM(field_3) FROM warehouse.public.records')).isError).not.toBe(true);
  const runs=await records(f);
  const elements=await withTenant(f.ctx,tx=>tx.query('SELECT run_id,exposed_name,state,treatment,withheld_reason FROM run_element WHERE run_id=ANY($1::uuid[])',[runs.map(r=>r.id)]));
  expect(elements).toEqual(expect.arrayContaining([{run_id:runs[0]!.id,exposed_name:'field_4',state:'released',treatment:'masked',withheld_reason:null},{run_id:runs[1]!.id,exposed_name:'field_3',state:'aggregated',treatment:'aggregate_only',withheld_reason:null},{run_id:runs[1]!.id,exposed_name:'field_5',state:'withheld',treatment:null,withheld_reason:'Restricted by data owner'}]));
 });
 it('M-011: records a refused request and its reason, selected but unused',async()=>{
  const f=await fixture();const execute=vi.spyOn(f.execution,'execute');
  const response=await f.query('SELECT field_5 FROM warehouse.public.records');expect(response.isError).toBe(true);expect(execute).not.toHaveBeenCalled();
  const [r]=await records(f);expect(r).toMatchObject({outcome:{kind:'refused',code:'element_withheld',stage:'validate'},used:null,versions:{tokenKeyVersionSelected:1}});
  const stages=await withTenant(f.ctx,tx=>tx.query<{detail:{message:string}}>("SELECT detail FROM run_stage WHERE run_id=$1 AND result='refuse'",[r!.id]));expect(stages[0]?.detail.message).toContain('withheld');
 });
 it('TOK-30: pins one version across two sources despite rotation during staging',async()=>{
  const f=await fixture();await f.addSource('other');let calls=0;
  const resolve=vi.spyOn(f.tokenSecrets,'resolveBytes').mockImplementation(async ref=>{expect(String(ref)).toMatch(/\/v1$/);if(++calls===1)await withPlatform(tx=>tx.query('UPDATE project SET token_key_version=2 WHERE id=$1',[f.ctx.projectId]));return Buffer.alloc(32,1);});
  const response=await f.query('SELECT a.field_2 AS first,b.field_2 AS second FROM warehouse.public.records a JOIN other.public.records b ON a.field_2=b.field_2');expect(response.isError,JSON.stringify(response)).not.toBe(true);expect(resolve).toHaveBeenCalledTimes(2);
  expect((await records(f))[0]).toMatchObject({versions:{tokenKeyVersionSelected:1},used:1});
 });
 it('records null use before tokenization, and actual use on failure after token production',async()=>{
  const f=await fixture();const estimate=vi.spyOn(f.stagingSource,'estimate').mockResolvedValueOnce(err(new DomainError('source_unavailable','Source is unavailable.')));
  expect((await f.query('SELECT field_2 FROM warehouse.public.records')).isError).toBe(true);estimate.mockRestore();
  const treated=f.stagingSource.treated.bind(f.stagingSource);vi.spyOn(f.stagingSource,'treated').mockImplementation((scan,_consume,signal)=>treated(scan,async()=>err(new DomainError('source_unavailable','Staging interrupted.')),signal));
  expect((await f.query('SELECT field_2 FROM warehouse.public.records')).isError).toBe(true);
  const rows=await records(f);expect(rows.map(r=>[r.versions.tokenKeyVersionSelected,r.used,r.outcome.kind])).toEqual([[1,null,'refused'],[1,1,'refused']]);
 });
 it('blocks source work when opening fails and withholds rows when completion fails',async()=>{
  const f=await fixture();const estimate=vi.spyOn(f.stagingSource,'estimate');
  const open=vi.spyOn(f.writer,'open').mockResolvedValueOnce(err(new DomainError('dependency_unavailable','Unavailable evidence storage.')));
  const first=await f.query('SELECT field_1 FROM warehouse.public.records');expect(first.isError).toBe(true);expect(estimate).not.toHaveBeenCalled();expect(await records(f)).toHaveLength(0);open.mockRestore();
  vi.spyOn(f.writer,'close').mockResolvedValueOnce(err(new DomainError('dependency_unavailable','Unavailable evidence storage.')));
  const second=await f.query('SELECT field_1 FROM warehouse.public.records');expect(second.isError).toBe(true);expect(second.structuredContent).toBeUndefined();expect((await records(f))[0]?.outcome).toBeNull();
 });
 it('selected keys remain unused for all-null tokens; later policy changes cannot rewrite a captured stamp',async()=>{
  const f=await fixture();await f.db(`UPDATE ${f.schema}.records SET field_2=NULL`);
  expect((await f.query('SELECT field_2 FROM warehouse.public.records')).isError).not.toBe(true);
  const first=(await records(f))[0]!;expect(first).toMatchObject({used:null,versions:{tokenKeyVersionSelected:1}});
  const estimate=f.stagingSource.estimate.bind(f.stagingSource);vi.spyOn(f.stagingSource,'estimate').mockImplementationOnce(async(...args)=>{
   await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='clear' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[1]]));return estimate(...args);
  });
  expect((await f.query('SELECT field_2 FROM warehouse.public.records')).isError).not.toBe(true);
  expect((await records(f))[1]!.versions.policy).toBe(first.versions.policy);
  expect((await f.query('SELECT field_2 FROM warehouse.public.records')).isError).not.toBe(true);
  expect((await records(f))[2]).toMatchObject({versions:{policy:first.versions.policy+1,tokenKeyVersionSelected:null},used:null});
 });
 it('ING-24: persists the landing strategy in force; synthetic follows reached source origin',async()=>{
  const f=await fixture();
  await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET landing_strategy='append_as_at' WHERE id=$1",[f.source]));
  const [p]=await withPlatform(tx=>tx.query<{industry_id:string}>('SELECT industry_id FROM project WHERE id=$1',[f.ctx.projectId]));
  const [t]=await withPlatformAdmin({actor:{kind:'system',id:'evidence-test'}},tx=>tx.query<{id:string}>("INSERT INTO demo_source_template(industry_id,name,kind,schema_spec,generator_spec) VALUES($1,$2,'postgres','{}','{}') RETURNING id",[p!.industry_id,'Evidence demo '+f.ctx.projectId]));
  await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET origin='demo',demo_template_id=$2 WHERE id=$1",[f.source,t!.id]));
  const response=await f.query('SELECT field_1 FROM warehouse.public.records');expect(response.isError,JSON.stringify(response)).not.toBe(true);
  expect((await records(f))[0]).toMatchObject({synthetic:true,source_plan:{sources:[{id:f.source,landingStrategy:'append_as_at'}]},freshness:{sources:[{landingStrategy:'append_as_at'}]}});
  expect((await f.query('SELECT 1')).isError).not.toBe(true);expect((await records(f))[1]).toMatchObject({synthetic:false,used:null,versions:{tokenKeyVersionSelected:null}});
 });
});
