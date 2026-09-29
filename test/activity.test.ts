import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {createHttpServer} from '../src/platform/http/index.js';
import {evidenceRoutes} from '../src/modules/evidence/api/routes.js';
import {EvidenceQuery,PostgresEvidenceReader,DuckDBEvidenceText} from '../src/modules/evidence/index.js';
import {ActivityPage,EvidenceDetail} from '../src/shared/api/activity.js';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {Timestamp} from '../src/shared/kernel/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
import {policyFixture,type PolicyFixture} from './fixtures/policy-version/fixture.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
resetDatabaseBeforeEach('company');
let f:PolicyFixture,server:ReturnType<typeof createHttpServer>,base:string,authorized:boolean,view:boolean;
const at=()=>new Date().toISOString();
async function header(request="SELECT field_1 FROM warehouse.public.records WHERE field_1 = 'sensitive-customer'",startedAt=at(),mode:'query'|'prompt'='query'){
 const id=randomUUID();await withTenant(f.ctx,tx=>tx.query("INSERT INTO query_run(id,project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'claimed-agent','opk_prefix',$7,$4,$5,$6)",[id,f.ctx.projectId,f.pool,request,{policy:7,catalog:3,vocabulary:2,tokenKeyVersionSelected:4},startedAt,mode]));return {id,startedAt};
}
async function settings(redaction:string,fields:string[]=[]){await withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{redaction,allowlistedFields:fields}}]));}
const detailUrl=(h:{id:string;startedAt:string},project=f.ctx.projectId)=>`${base}/api/v1/runs/${h.id}?${new URLSearchParams({projectId:project,startedAt:h.startedAt})}`;
beforeEach(async()=>{
 f=await policyFixture(3);authorized=true;view=true;
 const verdict=(allowed:boolean)=>({allowed,token:'test' as AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0});
 const unexpected=async():Promise<never>=>{throw new Error('Unexpected authorization mutation');};
 const auth:AuthorizationPort={check:async r=>{expect(r.permission).toBe('view');return verdict(view);},checkMany:async rs=>rs.map(r=>{expect(r.permission).toBe('view_unredacted');return verdict(authorized);}),write:unexpected,explain:unexpected};
 server=createHttpServer(evidenceRoutes(new EvidenceQuery(new PostgresEvidenceReader(),auth,new DuckDBEvidenceText())),{authorization:{port:auth,currentUser:async()=>({id:f.ctx.userId,email:'activity@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error();base=`http://127.0.0.1:${address.port}`;
});
afterEach(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
it('M-013/M-014: API redacts arguments in list and detail for viewers and aggressive policy; none is explicit',async()=>{
 const h=await header();await withTenant(f.ctx,async tx=>{
  await tx.query("INSERT INTO run_stage(run_id,started_at,stage,result,detail,ms) VALUES($1,$2,'execute','ok',$3,1)",[h.id,h.startedAt,{sql:'stage-sensitive',arbitrary:{arguments:'nested-sensitive'}}]);
  await tx.query("INSERT INTO run_completion(run_id,started_at,outcome,cil,source_plan,generated_sql,freshness,completed_at) VALUES($1,$2,$3,$4,$4,$5,$4,$2)",[h.id,h.startedAt,{kind:'answered',rowCount:1,truncated:false},{sql:'nested-sensitive'},"SELECT 'generated-sensitive'"]);
 });
 for(const [allowed,mode] of [[false,'none'],[false,'allowlist'],[true,'aggressive']] as const){authorized=allowed;await settings(mode,['sql']);
  const response=await fetch(detailUrl(h));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const raw=await response.text();expect(raw).not.toContain('sensitive');expect(EvidenceDetail.parse(JSON.parse(raw))).toMatchObject({request:null,generatedSql:null,argumentVisibility:'hidden'});
  const list=await (await fetch(`${base}/api/v1/projects/${f.ctx.projectId}/runs`)).text();expect(list).not.toContain('sensitive');
 }
 authorized=true;await settings('none');expect(EvidenceDetail.parse(await (await fetch(detailUrl(h))).json()).request).toContain('sensitive-customer');
 await settings('allowlist',['sql']);const stripped=EvidenceDetail.parse(await (await fetch(detailUrl(h))).json());expect(stripped.request).toContain('field_1');expect(stripped.request).toContain('[redacted]');expect(JSON.stringify(stripped)).not.toContain('sensitive');
 const prompt=await header('Find sensitive-customer',at(),'prompt');await settings('allowlist',['prompt','sql']);expect(EvidenceDetail.parse(await (await fetch(detailUrl(prompt))).json()).request).toBeNull();await settings('none');expect(EvidenceDetail.parse(await (await fetch(detailUrl(prompt))).json()).request).toBe('Find sensitive-customer');
});
it('historical versions and element states survive current policy changes; header-only reads as incomplete',async()=>{
 const h=await header();const load=async()=>EvidenceDetail.parse(await (await fetch(detailUrl(h))).json());expect(await load()).toMatchObject({status:'incomplete',completedAt:null,tokenKeyVersionUsed:null,versions:{policy:7,catalog:3,tokenKeyVersionSelected:4}});
 await withTenant(f.ctx,async tx=>{
  for(const [state,treatment] of [['released','tokenized'],['aggregated','aggregate_only'],['withheld',null],['undecided',null]] as const)await tx.query('INSERT INTO run_element(run_id,started_at,exposed_name,state,treatment,withheld_reason) VALUES($1,$2,$3,$4,$5,$6)',[h.id,h.startedAt,state,state,treatment,state==='withheld'?'Explicit withholding':null]);
  await tx.query('INSERT INTO run_completion(run_id,started_at,outcome,token_key_version_used,completed_at) VALUES($1,$2,$3,4,$2)',[h.id,h.startedAt,{kind:'reduced',rowCount:2,truncated:false,withheld:1}]);
 });await f.set('clear');
 const result=await load();expect(result.versions.policy).toBe(7);expect(result.versions.catalog).toBe(3);expect(result.tokenKeyVersionUsed).toBe(4);expect(result.elements).toHaveLength(4);expect(result.elements.find(e=>e.state==='withheld')?.treatment).toBeNull();
 expect((await fetch(detailUrl(h,randomUUID() as typeof f.ctx.projectId))).status).toBe(404);view=false;expect((await fetch(detailUrl(h))).status).toBe(404);
});
it('filters and keyset cursors preserve microseconds and bind to the project and complete filter set',async()=>{
 const prefix=new Date().toISOString().slice(0,19);const first=await header('SELECT 1',prefix+'.123451Z'),last=await header('SELECT 2',prefix+'.123459Z');
 const path=`${base}/api/v1/projects/${f.ctx.projectId}/runs?limit=1&poolId=${f.pool}&agentId=claimed-agent&mode=query&outcome=incomplete`;
 const one=ActivityPage.parse(await (await fetch(path)).json());expect(one.items[0]?.id).toBe(last.id);expect(one.nextCursor).not.toBeNull();
 const two=ActivityPage.parse(await (await fetch(`${path}&cursor=${one.nextCursor}`)).json());expect(two.items[0]?.id).toBe(first.id);expect(two.nextCursor).toBeNull();
 expect((await fetch(`${path}&from=${prefix}Z&cursor=${one.nextCursor}`)).status).toBe(400);
 expect((await fetch(`${base}/api/v1/projects/${f.ctx.projectId}/runs?from=2026-09-02T00:00:00Z&to=2026-09-01T00:00:00Z`)).status).toBe(400);
});
it('M-014: parsed literal stripping covers nesting, comments, escaped strings, numeric and boolean values; unknown syntax fails closed',async()=>{
 const strip=new DuckDBEvidenceText();
 for(const sql of ["SELECT a FROM warehouse.public.records WHERE b = 'sensitive''value' AND n > 924563 /* sensitive-comment */ LIMIT 37","WITH x AS (SELECT a FROM warehouse.public.records WHERE b IN ('sensitive-one','sensitive-two')) SELECT a FROM x WHERE a BETWEEN 87342 AND 99456","SELECT true AS flag, NULL AS absent, 982344 AS number FROM warehouse.public.records"]){const result=await strip.stripSql(sql);expect(result).not.toBeNull();expect(result).toContain('[redacted]');for(const value of ['sensitive','924563','87342','99456','982344','LIMIT 37','true'])expect(result?.toLowerCase()).not.toContain(value);}
 expect(await strip.stripSql("SELECT 'unterminated-sensitive")).toBeNull();expect(await strip.stripSql("COPY t TO 'sensitive-file'")).toBeNull();
 expect(await strip.stripSql("SELECT * FROM 'sensitive-file.parquet'")).toBeNull();
});
