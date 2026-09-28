import { DomainError,PoolId,ProjectId,ElementId,err,ok,type Result } from '../../../src/shared/kernel/index.js';
import { executionRequest,type ExecutionRequest, type StagingObject } from '../../../src/shared/execution-contract.js';
import { DuckDBSessionEngine,type EngineSession,type SessionEngine,type InspectionEvent } from '../../session/index.js';
import { InspectedSessionExecutor,type TreatmentPolicy } from '../../sql/index.js';
import { ExecutionQueue } from './queue.js';
import { deadlineClock,executionAudit,type ExecutionAudit,type DeadlineClock,type StagingSource } from './ports.js';
import { pushdown,referencedObjects } from './pushdown.js';
export const stagingRef=(o:StagingObject)=>`${o.catalog}__${o.schema}__${o.name}`;
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const cancelled=()=>err(new DomainError('budget_exceeded','The execution exceeded timeoutMs or was cancelled. No partial result was returned.',{resource:'time'},true));
export class StagedExecutor {
 constructor(private readonly source:StagingSource,private readonly engine:(r:ExecutionRequest)=>SessionEngine=r=>new DuckDBSessionEngine(undefined,undefined,undefined,r.limits),private readonly queue=new ExecutionQueue(),private readonly clock:DeadlineClock=deadlineClock,private readonly audit:ExecutionAudit=executionAudit){}
 execute(input:unknown,signal?:AbortSignal){return this.logged(input,false,signal);}
 validate(input:unknown,signal?:AbortSignal){return this.logged(input,true,signal);}
 private async logged(input:unknown,validateOnly:boolean,signal?:AbortSignal){
  const result=await this.run(input,validateOnly,signal),r=executionRequest.safeParse(input);
  if(r.success)this.audit.record({event:result.ok?'execution.completed':'execution.refused',requestId:r.data.requestId,projectId:r.data.projectId,poolId:r.data.poolId,operation:validateOnly?'validate':'execute',...(!result.ok?{reason:result.error.code}:{})});
  return result;
 }
 private async run(input:unknown,validateOnly:boolean,parent?:AbortSignal):Promise<Result<unknown>>{
  const decoded=executionRequest.safeParse(input);if(!decoded.success)return err(new DomainError('validation_failed','The execution request does not match the staged query contract.'));
  const r=decoded.data;
  const addresses=r.objects.map(o=>JSON.stringify([o.catalog,o.schema,o.name]));
  if(new Set(addresses).size!==addresses.length||new Set(r.objects.map(stagingRef)).size!==r.objects.length||new Set(r.sources.map(s=>s.sourceId)).size!==r.sources.length||r.objects.some(o=>o.catalog!==o.readPlan.catalog||!r.sources.some(s=>s.sourceId===o.sourceId)))return err(new DomainError('validation_failed','The staged source addresses or declarations are inconsistent.'));
  const controller=new AbortController(),abort=()=>controller.abort();parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
  const stop=this.clock.after(r.limits.timeoutMs,abort),signal=controller.signal;
  let release:(()=>void)|undefined;
  const active=new Set<EngineSession>();const interrupt=()=>{for(const s of active)s.interrupt?.();};signal.addEventListener('abort',interrupt);
  try{
   const lease=await this.queue.acquire(ProjectId(r.projectId),PoolId(r.poolId),r.limits.concurrency,r.settings.maxQueuedExecutions,signal);
   if(!lease.ok)return lease;release=lease.value;
   const policy:TreatmentPolicy={aggregateMinGroupSize:r.aggregateMinGroupSize,readPlan:r.objects.map(o=>({catalog:o.catalog,schema:o.schema,name:o.name,columns:o.readPlan.columns.map(c=>({name:c.exposedName,elementId:ElementId(c.elementId)}))})),
    entitlements:r.entitlements.map(e=>({...e,elementId:ElementId(e.elementId)}))};
   if(r.objects.some(o=>o.readPlan.columns.some(c=>!r.entitlements.some(e=>e.elementId===c.elementId&&e.treatment===c.treatment))))return err(new DomainError('sql_not_permitted','The read plan and authoritative entitlements disagree.'));
   // Duplicate references to an element may appear in more than one view, but
   // their decisions must agree. Never silently replace a conflicting decision.
   const decisions=new Map<string,TreatmentPolicy['entitlements'][number]>();
   for(const d of policy.entitlements){if(decisions.has(d.elementId)&&decisions.get(d.elementId)!.treatment!==d.treatment)return err(new DomainError('validation_failed','Conflicting element treatments.'));decisions.set(d.elementId,d);}policy.entitlements=[...decisions.values()];
   const ns={...r.namespace,objects:r.objects.map(o=>({catalog:o.catalog,schema:o.schema,name:o.name}))},limits={memoryMb:r.limits.memoryMb,threads:r.limits.threads};
   let tree:unknown;
   const preflightEngine=this.wrap(r,active,signal,true);
   const preflight=await new InspectedSessionExecutor(preflightEngine,(e:InspectionEvent)=>{if(e.stage==='inspected'&&tree===undefined)tree=e.tree;}).validate(r.sql,limits,ns,policy);
   if(signal.aborted)return cancelled();if(!preflight.ok||validateOnly)return preflight;
   const referenced=referencedObjects(tree,r.objects,r);
   const scans=referenced.map(object=>({object,request:r,predicate:pushdown(tree,object,r)}));
   // Admit every source scan before fetching any rows.
   for(const scan of scans){
    const estimate=await this.source.estimate(scan,signal);if(signal.aborted)return cancelled();if(!estimate.ok)return estimate;
    if(estimate.value===null||!Number.isFinite(estimate.value)||estimate.value<0||estimate.value>r.settings.maxStagingRows)return err(new DomainError('unsupported_pushdown',`Object ${scan.object.catalog}.${scan.object.schema}.${scan.object.name} cannot be staged within maxStagingRows=${r.settings.maxStagingRows}: its post-pushdown size is ${estimate.value===null?'unknown':'above the limit'}. Narrow the query or review this setting.`,{setting:'maxStagingRows',value:r.settings.maxStagingRows}));
   }
   const stage=async(privileged:EngineSession,agent:EngineSession):Promise<Result<void>>=>{
    for(const scan of scans){
     if(signal.aborted)return cancelled();
     const o=scan.object,table=stagingRef(o);
     if(!privileged.staging||!agent.staging)return err(new DomainError('dependency_unavailable','The engine cannot stage pool objects.'));
     let result:Result<void>;
     if(o.readPlan.columns.every(c=>c.treatment==='clear'||c.treatment==='aggregate_only'))result=await this.source.plain(scan,privileged,table,signal);
     else{
      await privileged.staging.create('memory','__staging',table,o.readPlan.columns.map(c=>({name:c.exposedName,type:c.exposedType})));
      let count=0;let appending:Promise<void>|undefined;
      try{result=await this.source.treated(scan,async rows=>{
       if(signal.aborted)return cancelled();
       count+=rows.length;
       if(count>r.settings.maxStagingRows)return err(new DomainError('unsupported_pushdown',`Object ${o.name} exceeded maxStagingRows=${r.settings.maxStagingRows} during staging. Narrow the query or review this setting.`,{setting:'maxStagingRows',value:r.settings.maxStagingRows}));
       appending=privileged.staging!.append('memory','__staging',table,rows);await appending;return ok(undefined);
      },signal);}finally{await appending?.catch(()=>{});}
     }
     if(!result.ok)return result;
     const counted=await privileged.execute(`SELECT COUNT(*) FROM __staging.${quote(table)}`);
     if(BigInt(String(counted.rows[0]?.[0]))>BigInt(r.settings.maxStagingRows))return err(new DomainError('unsupported_pushdown',`Object ${o.name} exceeded maxStagingRows=${r.settings.maxStagingRows} during staging. Narrow the query or review this setting.`,{setting:'maxStagingRows',value:r.settings.maxStagingRows}));
     await privileged.staging.transfer(table,{catalog:o.catalog,schema:o.schema,name:o.name},agent);
    }
    return ok(undefined);
   };
   const result=await new InspectedSessionExecutor(this.wrap(r,active,signal)).execute(r.sql,limits,ns,policy,{rowLimit:r.limits.rowLimit,signal,stage});
   if(signal.aborted)return cancelled();
   return result.ok?ok({...result.value,truncated:result.value.truncated??false,executionPath:'staged',policyVersion:r.policyVersion}):result;
  }catch(error){if(signal.aborted)return cancelled();if(error instanceof DomainError)return err(error);return err(new DomainError('dependency_unavailable','Staged execution could not complete. No partial result was returned.'));}
  finally{stop();signal.removeEventListener('abort',interrupt);parent?.removeEventListener('abort',abort);release?.();}
 }
 private async empty(agent:EngineSession,r:ExecutionRequest){
  if(!agent.staging)throw new Error('Staging capability unavailable.');
  await agent.staging.namespace(r.namespace.catalog,r.namespace.schema);
  for(const o of r.objects)await agent.staging.create(o.catalog,o.schema,o.name,o.readPlan.columns.map(c=>({name:c.exposedName,type:c.exposedType})));
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
