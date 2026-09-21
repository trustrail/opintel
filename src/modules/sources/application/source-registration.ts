import { notify, type ProjectEvents } from '../../../platform/sse/port.js';
import { safeSourceMessage, sourceMessages } from '../../../shared/source-errors.js';
import type { z } from 'zod';
import { DomainError, err, ok, type IndustryId, type DemoSourceId, type IdFactory, type ProjectId, type SourceId, type RunId, type UserId, type Result } from '../../../shared/kernel/index.js';
import { VaultRef } from '../../../platform/vault/types.js';
import type { Deployment, DemoTemplateItem, NewSource, SourceItem } from '../../../shared/api/source-schemas.js';
import type { GeneratorSpec, SchemaSpec } from '../../../shared/demo-contract.js';
import type { SourceConnector } from './source-connector.js';
import type { DemoProvisioningPort } from './demo-provisioning.js';
import type { IntrospectionJob } from './introspection-job.js';
export type SourceContext={projectId:ProjectId;userId:UserId};
export type PreparedTemplate={id:DemoSourceId;schemaSpec:SchemaSpec;generatorSpec:GeneratorSpec;deployment:z.infer<typeof Deployment>|null};
export type QueuedSource={sourceId:SourceId;runId:RunId;userId:UserId;templateId:DemoSourceId|null};
export interface SourceRegistrationRepository {
 list(ctx:SourceContext,after:SourceId|null,limit:number):Promise<Result<SourceItem[]>>;
 templates(ctx:SourceContext,industryId:IndustryId):Promise<Result<Array<z.infer<typeof DemoTemplateItem>>>>;
 template(ctx:SourceContext,id:DemoSourceId):Promise<Result<PreparedTemplate>>;
 create(ctx:SourceContext,id:SourceId,runId:RunId,input:NewSource,templateId:DemoSourceId|null):Promise<Result<{source:SourceItem;created:boolean}>>;
 archive(ctx:SourceContext,id:SourceId,confirmation?:string):Promise<Result<SourceItem>>;
 retry(ctx:SourceContext,id:SourceId,runId:RunId):Promise<Result<SourceItem>>;
 queued(ctx:SourceContext):Promise<QueuedSource[]>;
 settledFilings(ctx:SourceContext,id:SourceId):Promise<number>;
}
export class SourceRegistrationService {
 private readonly active=new Map<RunId,Promise<void>>();
 private readonly stop=new AbortController();
 private failure:DomainError|undefined;
 constructor(private readonly repository:SourceRegistrationRepository,private readonly ids:IdFactory,
  private readonly connector:(ctx:SourceContext,id:SourceId)=>SourceConnector & DemoProvisioningPort,
  private readonly jobs:IntrospectionJob,private readonly fail:(ctx:SourceContext,id:RunId,message:string)=>Promise<void>,private readonly events?:ProjectEvents){}
 async test(ctx:SourceContext,ref:string){
  const connector=this.connector(ctx,this.ids.create<SourceId>());
  const tested=await connector.testConnection(VaultRef(ref));
  if(!tested.ok)return ok({reachable:false,reason:tested.error.message,schemas:[] as string[]});
  const snapshot=await connector.introspect(VaultRef(ref),[]);
  return snapshot.ok?ok({reachable:true,reason:null,schemas:[...new Set(snapshot.value.objects.map(o=>o.schema))].sort()}):ok({reachable:false,reason:snapshot.error.message,schemas:[] as string[]});
 }
 async create(ctx:SourceContext,input:NewSource){
  const id=this.ids.create<SourceId>();
  const tested=await this.connector(ctx,id).testConnection(VaultRef(input.credentialRef));
  if(!tested.ok)return tested;
  const created=await this.repository.create(ctx,id,this.ids.create<RunId>(),input,null);
  if(created.ok){await notify(this.events,ctx.projectId,{type:'source.changed',sourceId:created.value.source.id});await this.resume(ctx);}
  return created.ok?ok(created.value.source):created;
 }
 async demo(ctx:SourceContext,id:DemoSourceId){
  const template=await this.repository.template(ctx,id);if(!template.ok)return template;
  const deployment=template.value.deployment;
  if(!deployment)return err(new DomainError('dependency_unavailable','The industry pack is not provisioned for this project. Ask the deployment operator to prepare it.'));
  const tested=await this.connector(ctx,deployment.sourceId).testConnection(deployment.credentialRef);if(!tested.ok)return tested;
  const created=await this.repository.create(ctx,deployment.sourceId,this.ids.create<RunId>(),{name:deployment.sourceName,kind:'postgres',credentialRef:deployment.credentialRef,includeSchemas:[deployment.sourceName],samplingConsent:false,receivesLandings:true,landingStrategy:'append_as_at'},id);
  if(created.ok){await notify(this.events,ctx.projectId,{type:'source.changed',sourceId:created.value.source.id});await this.resume(ctx);}
  return created;
 }
 async archive(ctx:SourceContext,id:SourceId,confirmation?:string){
  const result=await this.repository.archive(ctx,id,confirmation);
  if(result.ok){await notify(this.events,ctx.projectId,{type:'source.changed',sourceId:id});await notify(this.events,ctx.projectId,{type:'catalog.changed',sourceId:id});}
  return result;
 }
 async retry(ctx:SourceContext,id:SourceId){
  const queued=await this.repository.retry(ctx,id,this.ids.create<RunId>());
  if(queued.ok){await notify(this.events,ctx.projectId,{type:'source.changed',sourceId:id});await this.resume(ctx);}
  return queued;
 }
 async list(ctx:SourceContext,after:SourceId|null,limit:number){await this.resume(ctx);return this.repository.list(ctx,after,limit);}
 templates(ctx:SourceContext,industryId:IndustryId){return this.repository.templates(ctx,industryId);}
 async resume(ctx:SourceContext){
  for(const work of await this.repository.queued(ctx)){
   if(this.active.has(work.runId)||this.stop.signal.aborted)continue;
   const owner={...ctx,userId:work.userId};
   const done=this.execute(owner,work).catch(()=>err(new DomainError('dependency_unavailable',sourceMessages.unexpected))).then(async result=>{if(!result.ok){this.failure=result.error;await this.fail(owner,work.runId,result.error.message);}}).catch(()=>{console.warn({event:'source.job_failure',runId:work.runId});}).finally(()=>this.active.delete(work.runId));
   this.active.set(work.runId,done);
  }
 }
 private async prepareDemo(ctx:SourceContext,work:QueuedSource,signal:AbortSignal):Promise<Result<void>>{
  if(work.templateId){
   const template=await this.repository.template(ctx,work.templateId);if(!template.ok)return err(new DomainError(template.error.code,safeSourceMessage(template.error.code,template.error.message)));if(!template.value.deployment)return err(new DomainError('dependency_unavailable',sourceMessages.unprepared));
   const {deployment,schemaSpec,generatorSpec}=template.value;
   const source=await this.jobs.source(ctx,work.sourceId);
   if(!source.ok||deployment.sourceId!==work.sourceId||source.value.credentialRef!==deployment.credentialRef)return err(new DomainError('conflict',sourceMessages.deploymentInvalid));
   const provisioned=await this.connector(ctx,work.sourceId).provisionDemo(deployment.credentialRef,{templateId:work.templateId,schemaSpec,generatorSpec,landingZone:deployment.landingZone},signal);
   if(!provisioned.ok)return err(new DomainError(provisioned.error.code,safeSourceMessage(provisioned.error.code,provisioned.error.message),undefined,provisioned.error.retryable));
   const deadline=Date.now()+60000;
   while(await this.repository.settledFilings(ctx,work.sourceId)<(generatorSpec.files?.length??0)){
    if(signal.aborted)return err(new DomainError('dependency_unavailable',sourceMessages.cancelled));
    if(Date.now()>deadline)return err(new DomainError('dependency_unavailable',sourceMessages.landingWait));
    await new Promise<void>(resolve=>setTimeout(resolve,100));
   }
  }
  return ok(undefined);
 }
 private async execute(ctx:SourceContext,work:QueuedSource):Promise<Result<void>>{
  const prepare=work.templateId?(signal:AbortSignal)=>this.prepareDemo(ctx,work,signal).catch(()=>err(new DomainError('dependency_unavailable',sourceMessages.unexpected))):undefined;
  const result=await this.jobs.execute(ctx,work.runId,this.stop.signal,prepare);
  if(!result.ok&&result.error.code==='conflict')return ok(undefined); // Another worker already claimed this run.
  if(!result.ok)return err(new DomainError(result.error.code,safeSourceMessage(result.error.code,result.error.message)));
  if(result.value.state==='failed')this.failure=new DomainError(result.value.errorCode??'dependency_unavailable',result.value.error??sourceMessages.unexpected);
  return ok(undefined);
 }
 async idle():Promise<Result<void>>{await Promise.allSettled(this.active.values());const failure=this.failure;this.failure=undefined;return failure?err(failure):ok(undefined);}
 async close(){this.stop.abort();await Promise.allSettled(this.active.values());}
}
