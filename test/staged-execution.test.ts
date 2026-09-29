import { randomUUID } from 'node:crypto';
import { DuckDBSessionEngine } from '../sidecar/session/index.js';
import { describe,it,expect,vi } from 'vitest';
import { StagedExecutor } from '../sidecar/execution/application/execute.js';
import { ExecutionQueue } from '../sidecar/execution/application/queue.js';
import type { StagingSource } from '../sidecar/execution/application/ports.js';
import { executionRequest,executionResponse,executionSettings } from '../src/shared/execution-contract.js';
import { ProjectId,PoolId,ok } from '../src/shared/kernel/index.js';
const projectId=randomUUID(),poolId=randomUUID(),sourceId=randomUUID();
function request(){const elementId=randomUUID();return executionRequest.parse({tokenKeyVersionSelected:1,requestId:'staging-test',entitlements:[{elementId,treatment:'clear'}],projectId,poolId,policyVersion:1,sql:'SELECT id FROM orders ORDER BY id',namespace:{catalog:'memory',schema:'main'},sources:[{sourceId,credentialRef:'secret://test/source'}],objects:[{catalog:'memory',schema:'main',name:'orders',sourceId,readPlan:{catalog:'memory',schema:'public',object:'orders',columns:[{sourceIdentifier:'id',exposedName:'id',exposedType:'INTEGER',elementId,treatment:'clear',readAs:'native'}]}}],aggregateMinGroupSize:5,limits:{memoryMb:64,threads:1,timeoutMs:10000,rowLimit:2,concurrency:1},entitlementContext:null});}
function fixture(estimate:number|null=3){
 const source:StagingSource={estimate:vi.fn(async()=>ok(estimate)),plain:vi.fn(async(s,p,table)=>{await p.staging!.create('memory','__staging',table,s.object.readPlan.columns.map(c=>({name:c.exposedName,type:c.exposedType})));await p.staging!.append('memory','__staging',table,[[1],[2],[3]]);return ok(undefined);}),treated:vi.fn(async()=>ok(undefined))};
 return {source,executor:new StagedExecutor(source)};
}
describe('S2e staged governance',{timeout:30000},()=>{
 it('J-026 limits the inspected outer projection and declares truncation',async()=>{const f=fixture();const result=await f.executor.execute(request());expect(result.ok,result.ok?'':result.error.message).toBe(true);if(result.ok)expect(executionResponse.parse(result.value)).toMatchObject({rows:[[1],[2]],truncated:true,executionPath:'staged'});});
 it('keeps user LIMIT and OFFSET',async()=>{const f=fixture();const result=await f.executor.execute({...request(),sql:'SELECT id FROM orders ORDER BY id LIMIT 1 OFFSET 1'});expect(result).toMatchObject({ok:true,value:{rows:[[2]],truncated:false}});});
 it('validate and prohibited SQL never fetch source rows',async()=>{const f=fixture();expect((await f.executor.validate(request())).ok).toBe(true);expect(await f.executor.execute({...request(),sql:'COPY orders TO \'/tmp/no\''})).toMatchObject({ok:false,error:{code:'sql_not_permitted'}});expect(f.source.estimate).not.toHaveBeenCalled();expect(f.source.plain).not.toHaveBeenCalled();});
 for(const estimate of [null,5000001])it(`refuses ${estimate} estimate naming maxStagingRows`,async()=>{const f=fixture(estimate);const result=await f.executor.execute(request());expect(result).toMatchObject({ok:false,error:{code:'unsupported_pushdown',details:{setting:'maxStagingRows',value:5000000}}});expect(!result.ok&&result.error.message).toContain('maxStagingRows=5000000');expect(f.source.plain).not.toHaveBeenCalled();});
 it('project setting defaults and bounds',()=>{expect(executionSettings.parse({})).toEqual({maxStagingRows:5000000,maxQueuedExecutions:8});for(const value of [9999,100000001])expect(executionSettings.safeParse({maxStagingRows:value}).success).toBe(false);for(const value of [0,65])expect(executionSettings.safeParse({maxQueuedExecutions:value}).success).toBe(false);});
 it('J-025 queue is bounded per pool, FIFO, cancellable and retryable with depth',async()=>{
  const q=new ExecutionQueue(),p=ProjectId(projectId),pool=PoolId(poolId),signal=new AbortController();
  const first=await q.acquire(p,pool,1,1,signal.signal);expect(first.ok).toBe(true);
  const waiting=q.acquire(p,pool,1,1,signal.signal);const refused=await q.acquire(p,pool,1,1,signal.signal);
  expect(refused).toMatchObject({ok:false,error:{retryable:true,details:{depth:1,value:1,setting:'maxQueuedExecutions'}}});
  const other=await q.acquire(p,PoolId(randomUUID()),1,1,signal.signal);expect(other.ok).toBe(true);if(other.ok)other.value();
  if(first.ok)first.value();const next=await waiting;expect(next.ok).toBe(true);if(next.ok)next.value();
 });

 it('J-021 injected deadline interrupts the running native query and closes every session before returning',async()=>{
  let expire=()=>{};let ready!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;});
  const closed:string[]=[];
  const executor=new StagedExecutor(fixture().source,r=>{
   const native=new DuckDBSessionEngine(undefined,e=>{if(e.stage==='execute_started')ready();},undefined,r.limits);
   return {open:async role=>{const session=await native.open(role),close=session.close;session.close=()=>{closed.push(role);close();};return session;}};
  },new ExecutionQueue(),{after:(_ms,callback)=>{expire=callback;return ()=>{};}});
  const r=request();r.objects=[];r.sources=[];r.sql='SELECT sum(a.range*b.range) FROM range(10000000) a, range(10000000) b';
  const pending=executor.execute(r);await Promise.race([started,pending.then(r=>{throw new Error(JSON.stringify(r));})]);expire();
  expect(await pending).toMatchObject({ok:false,error:{code:'budget_exceeded'}});expect(closed).toEqual(['agent','privileged','agent','privileged']);
 });
 it('a queued cancellation never opens a session',async()=>{
  const q=new ExecutionQueue(),controller=new AbortController(),first=await q.acquire(ProjectId(projectId),PoolId(poolId),1,1,new AbortController().signal);
  const pending=q.acquire(ProjectId(projectId),PoolId(poolId),1,1,controller.signal);controller.abort();expect(await pending).toMatchObject({ok:false,error:{code:'budget_exceeded'}});if(first.ok)first.value();
 });

 it('LIMIT rendering preserves integers outside JavaScript safe precision',async()=>{const f=fixture(),r=request();r.objects=[];r.sources=[];r.entitlements=[];r.sql='SELECT 9007199254740993 AS exact';expect(await f.executor.execute(r)).toMatchObject({ok:true,value:{rows:[['9007199254740993']]}});});
 it('the supplied entitlement must agree with the read plan before source access',async()=>{const f=fixture(),r=request();r.entitlements[0]!.treatment='withheld';expect(await f.executor.execute(r)).toMatchObject({ok:false,error:{code:'sql_not_permitted'}});expect(f.source.estimate).not.toHaveBeenCalled();});
 it('clear predicates push down; token predicates alone retain the full scan estimate',async()=>{
  const f=fixture(),r=request();r.sql='SELECT id FROM orders WHERE id>1';expect((await f.executor.execute(r)).ok).toBe(true);expect(vi.mocked(f.source.estimate).mock.calls[0]![0].predicate).toContain('> 1');
  const c=r.objects[0]!.readPlan.columns[0]!;c.treatment='tokenized';c.exposedType='VARCHAR';c.readAs='text';c.token={domain:'id',canonId:'stdnum1',mode:'number',caseInsensitive:false};r.entitlements[0]!.treatment='tokenized';r.sql="SELECT id FROM orders WHERE id='v1_id_held'";
  const blocked=fixture(5000001);expect(await blocked.executor.execute(r)).toMatchObject({ok:false,error:{code:'unsupported_pushdown'}});expect(vi.mocked(blocked.source.estimate).mock.calls[0]![0].predicate).toBeNull();expect(blocked.source.treated).not.toHaveBeenCalled();
 });

 for(const treated of [false,true])it(`a low estimate cannot evade the actual staging bound on the ${treated?'connector':'native'} path`,async()=>{
  const r=request();r.settings.maxStagingRows=10000;
  const f=fixture(1);if(treated){const c=r.objects[0]!.readPlan.columns[0]!;c.treatment='masked';c.readAs='text';c.exposedType='VARCHAR';c.mask={kind:'all'};r.entitlements[0]!.treatment='masked';r.sql='SELECT id FROM orders';vi.mocked(f.source.treated).mockImplementation(async(_s,consume)=>{return consume(Array.from({length:10001},()=>['***']));});}
  else vi.mocked(f.source.plain).mockImplementation(async(_s,p,t)=>{await p.execute('CREATE SCHEMA __staging');await p.execute('CREATE TABLE __staging."'+t+'" AS SELECT i::INTEGER AS id FROM range(10001) r(i)');return ok(undefined);});
  const result=await f.executor.execute(r);expect(result).toMatchObject({ok:false,error:{code:'unsupported_pushdown',details:{setting:'maxStagingRows',value:10000}}});expect(result).not.toHaveProperty('value');
 });

 it('an empty pool needs no dummy table or column to execute a constant',async()=>{const f=fixture(),r=request();r.objects=[];r.entitlements=[];r.sources=[];r.namespace={catalog:'empty_pool',schema:'public'};r.sql='SELECT 1';expect(await f.executor.execute(r)).toMatchObject({ok:true,value:{rows:[[1]]}});r.sql='SELECT table_name FROM duckdb_tables()';expect(await f.executor.execute(r)).toMatchObject({ok:true,value:{rows:[]}});expect(f.source.estimate).not.toHaveBeenCalled();});
});
