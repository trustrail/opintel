import {withSourceTrace,lastSourcePhase} from '../../../src/shared/infrastructure/source-trace.js';
import {enginePhase} from '../../../src/shared/engine-phase.js';
import {stagedColumns} from '../../../src/shared/execution-contract.js';
import {sealResult} from '../../../src/shared/infrastructure/sealed-result.js';
import {previewRows} from './preview.js';
import {hasScope,predicateHash,referencedColumns} from '../../../src/shared/row-predicate.js';
import type {RowScopeReceipt} from '../../../src/shared/row-scope-contract.js';
import {StagedValidator} from './validate.js';
import { DomainError,PoolId,ProjectId,ElementId,err,ok,type Result } from '../../../src/shared/kernel/index.js';
import { executionRequest,type ExecutionRequest, type StagingObject } from '../../../src/shared/execution-contract.js';
import { DuckDBSessionEngine,type EngineSession,type SessionEngine,type InspectionEvent } from '../../session/index.js';
import { InspectedSessionExecutor,type TreatmentPolicy } from '../../sql/index.js';
import { ExecutionQueue } from './queue.js';
import { deadlineClock,executionAudit,type ExecutionAudit,type DeadlineClock,type StagingSource } from './ports.js';
import { pushdown,referencedObjects } from './pushdown.js';
export const stagingRef=(o:StagingObject)=>`${o.catalog}__${o.schema}__${o.name}`;
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export class StagedExecutor {
 constructor(private readonly source:StagingSource,private readonly engine:(r:ExecutionRequest)=>SessionEngine=r=>new DuckDBSessionEngine(undefined,undefined,undefined,r.limits),private readonly queue=new ExecutionQueue(),private readonly clock:DeadlineClock=deadlineClock,private readonly audit:ExecutionAudit=executionAudit,private readonly sealer:typeof sealResult=sealResult){}
 preview(input:unknown,signal?:AbortSignal){return withSourceTrace(()=>previewRows(input,this.source,this.queue,signal));}
 health(){return this.queue.snapshot();}
 execute(input:unknown,signal?:AbortSignal){return withSourceTrace(()=>this.logged(input,signal));}
 validate(input:unknown,signal?:AbortSignal){return new StagedValidator().validate(input,signal);}
 private async logged(input:unknown,signal?:AbortSignal){
  const usage:{tokenKeyVersionUsed:number|null;sourceIdsReached:string[];queueWaitMs:number}={tokenKeyVersionUsed:null,sourceIdsReached:[],queueWaitMs:0};
  const result=await this.run(input,signal,usage),r=executionRequest.safeParse(input);
  if(r.success)this.audit.record({event:result.ok?'execution.completed':'execution.refused',requestId:r.data.requestId,projectId:r.data.projectId,poolId:r.data.poolId,operation:'execute',...(!result.ok?{reason:result.error.code}:{})});
  return result.ok?ok({...result.value as object,tokenKeyVersionUsed:usage.tokenKeyVersionUsed,sourceIdsReached:usage.sourceIdsReached}):err(new DomainError(result.error.code,result.error.message,{...result.error.details,...usage},result.error.retryable));
 }
 private async run(input:unknown,parent:AbortSignal|undefined,usage:{tokenKeyVersionUsed:number|null;sourceIdsReached:string[];queueWaitMs:number}):Promise<Result<unknown>>{
  const decoded=executionRequest.safeParse(input);if(!decoded.success)return err(new DomainError('validation_failed','The execution request does not match the staged query contract.',{cause:'invalid_execution_contract'}));
  const r=decoded.data;
  for(const o of r.objects){const scope=o.readPlan.rowScope;if(!scope)continue;
   if(scope.poolId!==r.poolId||scope.predicate===null&&scope.decisionId!==null||scope.predicate!==null&&(scope.decisionId===null||hasScope(scope.predicate)||predicateHash(scope.predicate)!==scope.hash||referencedColumns(scope.predicate).some(id=>!scope.columns.some(c=>c.id===id)))||scope.pushdown&&scope.columns.some(c=>!r.entitlements.some(e=>e.elementId===c.id&&e.treatment==='clear')))return err(new DomainError('validation_failed','The row-scope plan is inconsistent. No rows were released.',{cause:'invalid_plan',reason:'row_scope'}));
  }

  const addresses=r.objects.map(o=>JSON.stringify([o.catalog,o.schema,o.name]));
  if(new Set(addresses).size!==addresses.length||new Set(r.objects.map(stagingRef)).size!==r.objects.length||new Set(r.sources.map(s=>s.sourceId)).size!==r.sources.length||r.objects.some(o=>o.catalog!==o.readPlan.catalog||!r.sources.some(s=>s.sourceId===o.sourceId)))return err(new DomainError('validation_failed','The staged source addresses or declarations are inconsistent.',{cause:'invalid_plan',reason:'source_declarations'}));
  let origin:'parent'|'engine_deadline'='parent';
  const cancelled=()=>{const phase=lastSourcePhase();return err(new DomainError('budget_exceeded','Execution was cancelled. No partial result was returned.',{cause:phase?'source_operation_cancelled':origin==='engine_deadline'?'deadline_exceeded':'parent_cancelled',cancellationOrigin:origin,...(phase?{sourceFailure:phase.failure,sourcePhaseState:phase.state,sourcePhaseAt:phase.timestamp}:{}),resource:'time'},true));};
  const controller=new AbortController(),abort=()=>{if(!controller.signal.aborted){origin='parent';controller.abort();}};parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
  let stop=()=>{};const signal=controller.signal;
  let release:(()=>void)|undefined;
  const active=new Set<EngineSession>();const interrupt=()=>{for(const s of active)s.interrupt?.();};signal.addEventListener('abort',interrupt);
  try{
   enginePhase(r.requestId,'queue','start');
   const queueStarted=performance.now();
   const lease=await this.queue.acquire(ProjectId(r.projectId),PoolId(r.poolId),r.limits.concurrency,r.settings.maxQueuedExecutions,signal,Math.max(1,Math.floor(r.limits.timeoutMs/3)));
   usage.queueWaitMs=Math.max(0,performance.now()-queueStarted);
   console.info({event:'engine.queue_wait',requestId:r.requestId,timestamp:new Date().toISOString(),queueWaitMs:usage.queueWaitMs,admitted:lease.ok});
   enginePhase(r.requestId,'queue','end');
   if(!lease.ok)return lease;release=lease.value;
   stop=this.clock.after(r.limits.timeoutMs,()=>{if(!signal.aborted){origin='engine_deadline';controller.abort();}});
   const policy:TreatmentPolicy={aggregateMinGroupSize:r.aggregateMinGroupSize,readPlan:r.objects.map(o=>({catalog:o.catalog,schema:o.schema,name:o.name,...(o.readPlan.contributor?{contributor:o.readPlan.contributor.internalName}:{}),columns:o.readPlan.columns.map(c=>({name:c.exposedName,elementId:ElementId(c.elementId),...(c.token?{tokenDomain:c.token.domain}:{})}))})),
    entitlements:r.entitlements.map(e=>({...e,elementId:ElementId(e.elementId)}))};
   if(r.objects.some(o=>o.readPlan.columns.some(c=>!r.entitlements.some(e=>e.elementId===c.elementId&&e.treatment===c.treatment))))return err(new DomainError('sql_not_permitted','The read plan and authoritative entitlements disagree.',{cause:'inspection_inconsistent',reason:'policy'}));
   // Duplicate references to an element may appear in more than one view, but
   // their decisions must agree. Never silently replace a conflicting decision.
   const decisions=new Map<string,TreatmentPolicy['entitlements'][number]>();
   for(const d of policy.entitlements){if(decisions.has(d.elementId)&&decisions.get(d.elementId)!.treatment!==d.treatment)return err(new DomainError('validation_failed','Conflicting element treatments.',{cause:'invalid_plan',reason:'conflicting_treatments'}));decisions.set(d.elementId,d);}policy.entitlements=[...decisions.values()];
   const ns={...r.namespace,objects:r.objects.map(o=>({catalog:o.catalog,schema:o.schema,name:o.name}))},limits={memoryMb:r.limits.memoryMb,threads:r.limits.threads};
   let tree:unknown;
   const preflightEngine=this.wrap(r,active,signal,true);
   enginePhase(r.requestId,'validate','start');
   const preflight=await new InspectedSessionExecutor(preflightEngine,(e:InspectionEvent)=>{if(e.stage==='inspected'&&tree===undefined)tree=e.tree;}).validate(r.sql,limits,ns,policy);
   enginePhase(r.requestId,'validate','end');
   if(signal.aborted)return cancelled();if(!preflight.ok)return preflight;
   const referenced=referencedObjects(tree,r.objects,r);
   const scans=referenced.map(object=>({object,request:r,predicate:pushdown(tree,object,r)}));
   const rowScopes:RowScopeReceipt[]=scans.flatMap(({object:o})=>o.readPlan.rowScope?[{objectId:o.readPlan.rowScope.objectId,objectName:[o.catalog,o.schema,o.name].join('.'),poolId:r.poolId,decisionId:o.readPlan.rowScope.decisionId,...(o.readPlan.rowScope.decisionIds?{decisionIds:o.readPlan.rowScope.decisionIds}:{}),hash:o.readPlan.rowScope.hash,columns:o.readPlan.rowScope.columns.map(c=>c.name),returnedRows:null,provenance:'agent credential',missingDecision:o.readPlan.rowScope.predicate===null}]:[]);
   // Admit every source scan before fetching any rows.
   if(r.objects.some(o=>o.readPlan.columns.some(c=>c.treatment==='tokenized'))&&r.tokenKeyVersionSelected===null)return err(new DomainError('dependency_unavailable','A tokenized plan requires a selected token key version.'));
   for(const scan of scans){
    if(scan.object.readPlan.rowScope?.predicate===null)continue;
    if(!usage.sourceIdsReached.includes(scan.object.sourceId))usage.sourceIdsReached.push(scan.object.sourceId);
    enginePhase(r.requestId,'scan','start');
    const estimate=await this.source.estimate(scan,signal);enginePhase(r.requestId,'scan','end');if(signal.aborted)return cancelled();if(!estimate.ok)return estimate;
    if(estimate.value===null||!Number.isFinite(estimate.value)||estimate.value<0||estimate.value>r.settings.maxStagingRows)return err(new DomainError('unsupported_pushdown',`Object ${scan.object.catalog}.${scan.object.schema}.${scan.object.name} cannot be staged within maxStagingRows=${r.settings.maxStagingRows}: its post-pushdown size is ${estimate.value===null?'unknown':'above the limit'}. Narrow the query or review this setting.`,{object:{catalog:scan.object.catalog,schema:scan.object.schema,name:scan.object.name},cause:estimate.value===null||!Number.isFinite(estimate.value)||estimate.value<0?'scan_size_unknown':'scan_estimate_large',setting:'maxStagingRows',value:r.settings.maxStagingRows}));
   }
   const stage=async(privileged:EngineSession,agent:EngineSession):Promise<Result<void>>=>{
    for(const scan of scans){
     if(signal.aborted)return cancelled();
     const o=scan.object,table=stagingRef(o);
     enginePhase(r.requestId,'stage','start');
     if(!privileged.staging||!agent.staging)return err(new DomainError('dependency_unavailable','The engine cannot stage pool objects.',{cause:'component_configuration',reason:'staging_capability'}));
     let result:Result<void>;
     if(o.readPlan.rowScope?.predicate===null){
      await privileged.staging.create('memory','__staging',table,stagedColumns(o.readPlan));
      rowScopes.find(s=>s.objectId===o.readPlan.rowScope!.objectId)!.returnedRows=0;
      await privileged.staging.transfer(table,{catalog:o.catalog,schema:o.schema,name:o.name},agent);enginePhase(r.requestId,'stage','end');continue;
     }
     if(!o.readPlan.contributor&&(!o.readPlan.rowScope||o.readPlan.rowScope.pushdown)&&o.readPlan.columns.every(c=>!c.numericDefault&&(c.treatment==='clear'||c.treatment==='aggregate_only')))result=await this.source.plain(scan,privileged,table,signal);
     else{
      await privileged.staging.create('memory','__staging',table,stagedColumns(o.readPlan));
      let count=0;let appending:Promise<void>|undefined;
      try{result=await this.source.treated({...scan,onTokenized:()=>{usage.tokenKeyVersionUsed=r.tokenKeyVersionSelected;}},async rows=>{
       if(signal.aborted)return cancelled();
       count+=rows.length;
       if(count>r.settings.maxStagingRows)return err(new DomainError('unsupported_pushdown',`Object ${o.name} exceeded maxStagingRows=${r.settings.maxStagingRows} during staging. Narrow the query or review this setting.`,{object:{catalog:o.catalog,schema:o.schema,name:o.name},cause:'scan_observed_large',setting:'maxStagingRows',value:r.settings.maxStagingRows}));
       enginePhase(r.requestId,'stage','start');
       appending=privileged.staging!.append('memory','__staging',table,rows);try{await appending;enginePhase(r.requestId,'stage','end');}catch(error){if(error instanceof DomainError||error instanceof Error&&error.message.startsWith('Out of Memory Error:'))throw error;throw new DomainError('source_unavailable','Local staging could not append source rows.',{cause:'staging_failed'});}return ok(undefined);
      },signal);}finally{await appending?.catch(()=>{});}
     }
     if(!result.ok)return result;
     const counted=await privileged.execute(`SELECT COUNT(*) FROM __staging.${quote(table)}`);
     if(BigInt(String(counted.rows[0]?.[0]))>BigInt(r.settings.maxStagingRows))return err(new DomainError('unsupported_pushdown',`Object ${o.name} exceeded maxStagingRows=${r.settings.maxStagingRows} during staging. Narrow the query or review this setting.`,{object:{catalog:o.catalog,schema:o.schema,name:o.name},cause:'scan_observed_large',setting:'maxStagingRows',value:r.settings.maxStagingRows}));
     if(o.readPlan.rowScope)rowScopes.find(s=>s.objectId===o.readPlan.rowScope!.objectId)!.returnedRows=Number(counted.rows[0]?.[0]);
     await privileged.staging.transfer(table,{catalog:o.catalog,schema:o.schema,name:o.name},agent);enginePhase(r.requestId,'stage','end');
    }
    return ok(undefined);
   };
   enginePhase(r.requestId,'execute','start');
   const result=await new InspectedSessionExecutor(this.wrap(r,active,signal)).execute(r.sql,limits,ns,policy,{rowLimit:r.limits.rowLimit,signal,stage});
   enginePhase(r.requestId,'execute','end');
   if(signal.aborted)return cancelled();
   // Seal only the final bounded result, after SQL and disclosure enforcement.
   // K is generated/split here and never crosses the Engine transport.
   let custodyShares:{first:string;second:string}|undefined;
   if(result.ok&&result.value.custodyIndices?.length){
    enginePhase(r.requestId,'seal','start');
    const sealed=this.sealer(result.value.rows,result.value.columns,result.value.custodyIndices,r.requestId);
    try{result.value.rows=sealed.rows;custodyShares={first:sealed.first.toString('base64url'),second:sealed.second.toString('base64url')};
     for(const i of result.value.custodyIndices)if(result.value.columnTypes)result.value.columnTypes[i]='VARCHAR';
    }finally{sealed.first.fill(0);sealed.second.fill(0);enginePhase(r.requestId,'seal','end');}
   }
   return result.ok?ok({...result.value,...(custodyShares?{custodyShares}:{}),...(rowScopes.length?{rowScopes}:{}),...(rowScopes.some(s=>s.missingDecision)?{rows:[]}:{}),truncated:result.value.truncated??false,executionPath:'staged',policyVersion:r.policyVersion}):result;
  }catch(error){if(signal.aborted)return cancelled();if(error instanceof DomainError)return err(error);return err(new DomainError('dependency_unavailable','Staged execution could not complete. No partial result was returned.'));}
  finally{stop();signal.removeEventListener('abort',interrupt);parent?.removeEventListener('abort',abort);release?.();}
 }
 private async empty(agent:EngineSession,r:ExecutionRequest){
  if(!agent.staging)throw new Error('Staging capability unavailable.');
  await agent.staging.namespace(r.namespace.catalog,r.namespace.schema);
  for(const o of r.objects)await agent.staging.create(o.catalog,o.schema,o.name,stagedColumns(o.readPlan));
  await agent.execute("SET search_path='"+(quote(r.namespace.catalog)+'.'+quote(r.namespace.schema)).replaceAll("'","''")+"'");
 }
 private wrap(r:ExecutionRequest,active:Set<EngineSession>,signal:AbortSignal,preflight=false):SessionEngine{
  const driver=this.engine(r);
  return {open:async role=>{
   if(signal.aborted)throw new Error('Interrupt Error: Cancelled');
   const session=await driver.open(role);active.add(session);
   try{
    if(signal.aborted)throw new Error('Interrupt Error: Cancelled');
    if(role==='agent')await this.empty(session,r);
    if(preflight&&session.inspection)session.inspection={...session.inspection,estimate:async()=>null};
    const close=session.close;session.close=()=>{active.delete(session);close();};return session;
   }catch(error){active.delete(session);session.close();throw error;}
  }};
 }
}
