import {engineHealthPolicySchema,type EngineHealthPolicy} from './health-policy.js';
import {readinessFailure,readinessMessages,isReadinessMessage} from '../../../shared/engine-readiness.js';
import {DomainError,err,ok,type EngineId,type ProjectId,type UserId,type SourceId,type Result} from '../../../shared/kernel/index.js';
import type {EngineRegistration,EngineView} from '../../../shared/api/engines.js';
export type EngineContext={projectId:ProjectId;userId:UserId};
export type EngineRecord=Omit<EngineView,'sources'>&{registrationVersion:number};
export type ApplicationTls={ca:string;cert:string;key:string};
export type EngineEndpoint={baseUrl:string;tls:ApplicationTls&{certificatePin:string};timeoutMs?:number;queryEngineVersion?:string};
export type EngineRoute={id:SourceId;name:string;engine:EngineRecord|null};
type HealthObservation={record:EngineRecord;queryEngineVersion:string;observedAt:number;ctx:EngineContext};
type QueryRecord=EngineRecord&{admissionObservation?:HealthObservation};
export interface EngineRepository {
 heartbeat(ctx:EngineContext,value:EngineRecord):Promise<{at:string|null;policyCurrent:boolean;record:EngineRecord|null}>;
 routes(ctx:EngineContext,ids:readonly SourceId[]):Promise<EngineRoute[]>;
 update(ctx:EngineContext,id:EngineId,input:EngineRegistration):Promise<Result<void>>;
 register(ctx:EngineContext,input:EngineRegistration):Promise<Result<EngineRecord>>;
 get(ctx:EngineContext,id:EngineId):Promise<Result<EngineRecord>>;
 list(ctx:EngineContext,after:EngineId|null,limit:number):Promise<EngineView[]>;
 health(ctx:EngineContext,id:EngineId,value:{contractVersion:number|null;health:EngineView['health'];message:string|null;verified:boolean;address:string;certificatePin:string;name:string;registrationVersion:number}):Promise<Result<EngineRecord>>;
 custody(ctx:EngineContext):Promise<Result<EngineRecord>>;
 designate(ctx:EngineContext,id:EngineId):Promise<Result<void>>;
 source(ctx:EngineContext,id:SourceId):Promise<Result<{id:SourceId;name:string;engineId:EngineId|null;tokenized:boolean}>>;
 assign(ctx:EngineContext,source:SourceId,id:EngineId):Promise<Result<void>>;
 key(ctx:EngineContext):Promise<{version:number;sentinel:string}|null>;
}
export interface EngineProbe {
 registerEgress?(endpoint:EngineEndpoint,projectId:ProjectId,engineId:EngineId):Promise<Result<void>>;
 health(endpoint:EngineEndpoint):Promise<Result<{contract:number;queryEngineVersion:string;canonicalisers:string[]}>>;
 sentinel(endpoint:EngineEndpoint,project:ProjectId):Promise<Result<{version:number|null;sentinel:string|null}>>;
}
export const engineRefusal=(message:string,retryable=false)=>err(new DomainError('source_unavailable',message,{cause:'engine_registry'},retryable));
export class EngineRegistry {
 private readonly probes=new Map<string,{promise:Promise<Result<EngineRecord>>;failedUntil:number}>();
 private readonly observations=new Map<string,HealthObservation>();
 private readonly tracked=new Map<string,{ctx:EngineContext;record:EngineRecord;lastUsed:number}>();
 private readonly policy:EngineHealthPolicy;
 private refreshTimer:ReturnType<typeof setInterval>|undefined;
 constructor(private readonly repository:EngineRepository,private readonly probe:EngineProbe,private readonly tls:ApplicationTls,policy:Partial<EngineHealthPolicy>={},private readonly now:()=>number=Date.now){this.policy=engineHealthPolicySchema.parse(policy);this.tls={...tls};}
 private identity(ctx:EngineContext,value:EngineRecord){return JSON.stringify([ctx.projectId,value.id,value.address,value.certificatePin,value.name,value.registrationVersion]);}
 startHealthRefresh(){
  if(this.refreshTimer||!this.policy.reuseEnabled)return;
  let pending=false;
  this.refreshTimer=setInterval(()=>{if(pending)return;pending=true;void this.refreshHealth().catch(()=>{console.warn({event:'engine.health_refresh_failed',timestamp:new Date(this.now()).toISOString()});}).finally(()=>{pending=false;});},this.policy.refreshMs);this.refreshTimer.unref();
 }
 close(){if(this.refreshTimer)clearInterval(this.refreshTimer);this.refreshTimer=undefined;this.observations.clear();this.tracked.clear();}
 async refreshHealth(){
  for(const [identity,observation] of this.observations)if(!this.tracked.has(identity)&&this.now()-observation.observedAt>=this.policy.maxAgeMs)this.observations.delete(identity);
  const results=await Promise.allSettled([...this.tracked].map(async([identity,observation])=>{
   if(this.now()-observation.lastUsed>=this.policy.maxAgeMs){this.observations.delete(identity);this.tracked.delete(identity);return;}
   const current=await this.repository.get(observation.ctx,observation.record.id);
   if(!current.ok||this.identity(observation.ctx,current.value)!==identity||current.value.health==='unverified'){this.observations.delete(identity);this.tracked.delete(identity);return;}
   await this.verifyLoaded(observation.ctx,current.value);
  }));
  if(results.some(result=>result.status==='rejected'))console.warn({event:'engine.health_refresh_failed',timestamp:new Date(this.now()).toISOString()});
 }
 private async queryReadyLoaded(ctx:EngineContext,value:EngineRecord):Promise<Result<QueryRecord>>{
  if(!value.verifiedAt&&value.health==='unverified')return this.readyLoaded(ctx,value);
  const identity=this.identity(ctx,value);
  this.tracked.set(identity,{ctx,record:value,lastUsed:this.now()});
  let current=value;
  // A known explicit unhealthy observation is never eligible for reuse.
  if(current.health!=='healthy'||!current.verifiedAt)return engineRefusal(`Engine ${value.name} is not healthy. Verify its readiness before querying.`,true);
  if(this.policy.reuseEnabled){
   const heartbeat=await this.repository.heartbeat(ctx,current),age=heartbeat.at===null?Infinity:this.now()-Date.parse(heartbeat.at);
   if(!heartbeat.policyCurrent||!Number.isFinite(age)||age<0)return engineRefusal(`Engine ${value.name} has no current acknowledged heartbeat.`,true);
   if(!heartbeat.record)return engineRefusal(`Engine ${value.name} verification changed.`,true);
   current=heartbeat.record;
   if(age>=this.policy.heartbeatMaxAgeMs)return this.verifyStaleHeartbeat(ctx,current,age);
   const observation=this.observations.get(identity);
   if(observation&&current.verifiedAt===observation.record.verifiedAt&&this.now()-observation.observedAt>=0&&this.now()-observation.observedAt<this.policy.maxAgeMs){return ok(current);}
  }
  const checked=await this.readyLoaded(ctx,current);
  if(checked.ok&&this.policy.reuseEnabled){
   const heartbeat=await this.repository.heartbeat(ctx,checked.value),age=heartbeat.at===null?Infinity:this.now()-Date.parse(heartbeat.at);
   if(!heartbeat.policyCurrent||!heartbeat.record||!Number.isFinite(age)||age<0)return engineRefusal(`Engine ${value.name} has no current acknowledged heartbeat.`,true);
   if(age>=this.policy.heartbeatMaxAgeMs){
    console.info({event:'engine.heartbeat_stale',timestamp:new Date(this.now()).toISOString(),engineId:value.id,ageMs:Math.min(age,Number.MAX_SAFE_INTEGER)});
    return ok({...heartbeat.record,admissionObservation:this.observations.get(identity)});
   }
  }
  return checked;
 }
 private async verifyStaleHeartbeat(ctx:EngineContext,record:EngineRecord,ageMs:number):Promise<Result<QueryRecord>>{
  console.info({event:'engine.heartbeat_stale',timestamp:new Date(this.now()).toISOString(),engineId:record.id,ageMs:Math.min(ageMs,Number.MAX_SAFE_INTEGER)});
  const checked=await this.verifyLoaded(ctx,record,false);
  if(!checked.ok)return checked;
  return ok({...checked.value,admissionObservation:this.observations.get(this.identity(ctx,checked.value))});
 }
 private async queryEndpoint(ctx:EngineContext,record:QueryRecord):Promise<Result<EngineEndpoint>>{
  let serving=record;
  // Token attestation may have consumed time since admission. Recheck at dispatch.
  if(this.policy.reuseEnabled){
   const heartbeat=await this.repository.heartbeat(ctx,record),age=heartbeat.at===null?Infinity:this.now()-Date.parse(heartbeat.at);
   if(!heartbeat.policyCurrent||!heartbeat.record||!Number.isFinite(age)||age<0)return engineRefusal(`Engine ${record.name} has no current acknowledged heartbeat.`,true);
   const observed=this.observations.get(this.identity(ctx,record));
   if(age>=this.policy.heartbeatMaxAgeMs&&(!record.admissionObservation||record.admissionObservation!==observed)){
    const checked=await this.verifyStaleHeartbeat(ctx,heartbeat.record,age);if(!checked.ok)return checked;
    // Recheck policy/registration after the synchronous network operation.
    const latest=await this.repository.heartbeat(ctx,checked.value);
    if(!latest.policyCurrent||!latest.record)return engineRefusal(`Engine ${record.name} verification changed.`,true);
    serving=checked.value;
   }
  }
  const observation=this.observations.get(this.identity(ctx,serving));
  return observation&&this.now()-observation.observedAt>=0&&this.now()-observation.observedAt<this.policy.maxAgeMs?ok({...this.endpoint(serving),queryEngineVersion:observation.queryEngineVersion}):engineRefusal('Engine health changed while preparing the query.',true);
 }
 async forQueryCustody(ctx:EngineContext){const record=await this.repository.custody(ctx);if(!record.ok)return record;const ready=await this.queryReadyLoaded(ctx,record.value);return ready.ok?this.queryEndpoint(ctx,ready.value):ready;}
 forQuerySources(ctx:EngineContext,inputs:readonly {id:SourceId;tokenized?:boolean}[]){return this.routeSources(ctx,inputs,true);}
 endpoint(record:EngineRecord):EngineEndpoint{return {baseUrl:record.address,tls:{...this.tls,certificatePin:record.certificatePin}};}
 async update(ctx:EngineContext,id:EngineId,input:EngineRegistration){const result=await this.repository.update(ctx,id,input);if(result.ok)for(const [key,value] of this.observations)if(value.ctx.projectId===ctx.projectId&&value.record.id===id){this.observations.delete(key);this.tracked.delete(key);}return result;}
 register(ctx:EngineContext,input:EngineRegistration){return this.repository.register(ctx,input);}
 list(ctx:EngineContext,after:EngineId|null,limit:number){return this.repository.list(ctx,after,limit);}
 async verify(ctx:EngineContext,id:EngineId){
  const record=await this.repository.get(ctx,id);if(!record.ok)return record;
  return this.verifyLoaded(ctx,record.value);
 }
 private async verifyLoaded(ctx:EngineContext,value:EngineRecord,registerEgress=true){
  const id=value.id;
  const key=this.identity(ctx,value)+(registerEgress?'':'/health-only');
  const existing=this.probes.get(key);if(existing&&(existing.failedUntil===0||existing.failedUntil>this.now()))return existing.promise;
  const entry={promise:this.verifyRecord(ctx,id,value,registerEgress),failedUntil:0};this.probes.set(key,entry);
  try{const result=await entry.promise;if(result.ok)this.probes.delete(key);else{entry.failedUntil=this.now()+1000;const timer=setTimeout(()=>{if(this.probes.get(key)===entry)this.probes.delete(key);},1000);timer.unref();}return result;}catch(error){this.probes.delete(key);throw error;}
 }
 private async verifyRecord(ctx:EngineContext,id:EngineId,value:EngineRecord,registerEgress=true):Promise<Result<EngineRecord>>{
  const record={value},identity=this.identity(ctx,value);
  const result=await this.probe.health(this.endpoint(record.value)).catch(()=>engineRefusal('Engine health probe failed.',true));
  if(!result.ok&&result.error.details?.reason==='control_connect_timeout'){console.info({event:'engine.health_observation_missed',timestamp:new Date(this.now()).toISOString(),engineId:id,stage:'health'});return engineRefusal(`Engine ${value.name} could not be verified. Check its address, certificate pin and application TLS trust.`,true);}
  if(!result.ok){this.observations.delete(identity);console.info({event:'engine.verification_refused',timestamp:new Date(this.now()).toISOString(),stage:'health'});const reason=readinessFailure.safeParse(result.error.details?.readinessReason);const message=reason.success?readinessMessages[reason.data]:isReadinessMessage(record.value.healthMessage)?record.value.healthMessage:'Verification failed. Check the address, certificate pin and application TLS trust.';await this.repository.health(ctx,id,{address:record.value.address,certificatePin:record.value.certificatePin,name:record.value.name,registrationVersion:record.value.registrationVersion,contractVersion:null,health:'unavailable',message,verified:false});return engineRefusal(`Engine ${record.value.name} could not be verified. Check its address, certificate pin and application TLS trust.`,true);}
  const observedAt=this.now();
  if(registerEgress&&result.value.contract===3&&this.probe.registerEgress){const registered=await this.probe.registerEgress(this.endpoint(value),ctx.projectId,id);if(!registered.ok){if(registered.error.details?.reason==='control_connect_timeout'){console.info({event:'engine.health_observation_missed',timestamp:new Date(this.now()).toISOString(),engineId:id,stage:'egress_registration'});return registered;}this.observations.delete(identity);console.info({event:'engine.verification_refused',timestamp:new Date(this.now()).toISOString(),stage:'egress_registration'});await this.repository.health(ctx,id,{address:value.address,certificatePin:value.certificatePin,name:value.name,registrationVersion:value.registrationVersion,contractVersion:null,health:'unavailable',message:'Engine egress registration failed.',verified:false});return registered;}}
  const matches=result.value.contract===3;
  const updated=await this.repository.health(ctx,id,{address:record.value.address,certificatePin:record.value.certificatePin,name:record.value.name,registrationVersion:record.value.registrationVersion,contractVersion:result.value.contract,health:matches?'healthy':'contract_mismatch',message:matches?null:'This application requires engine contract 3.',verified:matches});
  if(matches&&updated.ok){this.observations.set(identity,{record:updated.value,queryEngineVersion:result.value.queryEngineVersion,observedAt,ctx});console.info({event:'engine.health_observed',timestamp:new Date(observedAt).toISOString(),engineId:id});return updated;}
  this.observations.delete(identity);
  if(matches)return updated;
  return engineRefusal(`Engine ${record.value.name} reports contract ${result.value.contract}; this application requires contract 3.`);
 }
 async ready(ctx:EngineContext,id:EngineId){const r=await this.repository.get(ctx,id);return r.ok?this.readyLoaded(ctx,r.value):r;}
 private async readyLoaded(ctx:EngineContext,value:EngineRecord){const r={value};
  // Failed probes clear serving authority, not permission to try again. New or
  // edited registrations still require the explicit initial connection check.
  if(!r.value.verifiedAt&&r.value.health==='unverified')return engineRefusal(`Engine ${r.value.name} has not passed verification. Test its connection in Settings before assigning or using sources.`);
  return this.verifyLoaded(ctx,value);
 }
 async tokenReady(ctx:EngineContext,record:EngineRecord){
  return this.tokenReadyWithKey(ctx,record,await this.repository.key(ctx));
 }
 private async tokenReadyWithKey(ctx:EngineContext,record:EngineRecord,expected:{version:number;sentinel:string}|null){
  if(!expected)return engineRefusal(`Engine ${record.name} cannot serve tokenized data: the project has no recorded token key.`);
  const actual=await this.probe.sentinel(this.endpoint(record),ctx.projectId);
  if(!actual.ok||actual.value.version!==expected.version||actual.value.sentinel!==expected.sentinel){console.info({event:'engine.verification_refused',timestamp:new Date(this.now()).toISOString(),stage:'token_attestation',reason:actual.ok?'mismatch':'unavailable'});return engineRefusal(`Engine ${record.name} cannot serve tokenized data: its key version or sentinel does not match the project's recorded key. Ask the operator to provision the matching key and verify again.`);}
  return ok(undefined);
 }
 /** One fresh routing snapshot per batch. Promises below deduplicate work only
  * within this invocation; no route, key or compiled decision survives it. */
 forSources(ctx:EngineContext,inputs:readonly {id:SourceId;tokenized?:boolean}[]){return this.routeSources(ctx,inputs,false);}
 private async routeSources(ctx:EngineContext,inputs:readonly {id:SourceId;tokenized?:boolean}[],query:boolean){
  if(!inputs.length)return [];
  const routes=await this.repository.routes(ctx,[...new Set(inputs.map(s=>s.id))]);
  const engines=new Map<EngineId,Promise<Result<QueryRecord>>>();
  for(const route of routes)if(route.engine&&!engines.has(route.engine.id))engines.set(route.engine.id,query?this.queryReadyLoaded(ctx,route.engine):this.readyLoaded(ctx,route.engine));
  const verified=new Map<EngineId,Result<QueryRecord>>();
  await Promise.all([...engines].map(async([id,pending])=>{verified.set(id,await pending);}));
  const needsKey=inputs.some(input=>input.tokenized&&routes.some(r=>r.id===input.id&&r.engine&&verified.get(r.engine.id)?.ok));
  const key=needsKey?await this.repository.key(ctx):null;
  const sentinels=new Map<EngineId,Promise<Result<void>>>();
  return Promise.all(inputs.map(async input=>{
   const source=routes.find(r=>r.id===input.id);
   if(!source)return err(new DomainError('not_found','Source not found in this project.'));
   if(!source.engine)return engineRefusal(`Source ${source.name} has no assigned engine. Assign a verified engine in Settings before introspecting or querying it.`);
   const r=verified.get(source.engine.id);if(!r)throw new Error('Missing batch engine verification.');if(!r.ok)return r;
   if(input.tokenized){let pending=sentinels.get(r.value.id);if(!pending){pending=this.tokenReadyWithKey(ctx,r.value,key);sentinels.set(r.value.id,pending);}const token=await pending;if(!token.ok)return token;}
   return query?this.queryEndpoint(ctx,r.value):ok(this.endpoint(r.value));
  }));
 }
 async forSource(ctx:EngineContext,id:SourceId,tokenized=false){const [result]=await this.forSources(ctx,[{id,tokenized}]);if(!result)throw new Error('Missing source routing result.');return result;}
 async forEngine(ctx:EngineContext,id:EngineId,checkKey=false){const r=await this.ready(ctx,id);if(!r.ok)return r;if(checkKey){const t=await this.tokenReady(ctx,r.value);if(!t.ok)return t;}return ok(this.endpoint(r.value));}
 async forCustody(ctx:EngineContext){const r=await this.repository.custody(ctx);if(!r.ok)return r;return this.forEngine(ctx,r.value.id);}
 async designate(ctx:EngineContext,id:EngineId){const r=await this.ready(ctx,id);if(!r.ok)return r;const key=await this.repository.key(ctx);if(key){const t=await this.tokenReady(ctx,r.value);if(!t.ok)return t;}return this.repository.designate(ctx,id);}
 async assign(ctx:EngineContext,source:SourceId,id:EngineId){const s=await this.repository.source(ctx,source);if(!s.ok)return s;const r=await this.ready(ctx,id);if(!r.ok)return r;if(s.value.tokenized){const t=await this.tokenReady(ctx,r.value);if(!t.ok)return t;}return this.repository.assign(ctx,source,id);}
}
