import { notify, type ProjectEvents } from '../../../platform/sse/port.js';
import { safeSourceMessage, sourceMessages } from '../../../shared/source-errors.js';
import { DomainError, err, ok, type IdFactory, type ProjectId, type SourceId, type RunId, type UserId, type Result } from '../../../shared/kernel/index.js';
import type { NewSource, SourceItem } from '../../../shared/api/source-schemas.js';
import type { SourceConnector } from './source-connector.js';
import type { IntrospectionJob } from './introspection-job.js';
export type SourceContext={projectId:ProjectId;userId:UserId};
export type QueuedSource={sourceId:SourceId;runId:RunId;userId:UserId};
export interface SourceRegistrationRepository {
 list(ctx:SourceContext,after:SourceId|null,limit:number):Promise<Result<SourceItem[]>>;
 create(ctx:SourceContext,id:SourceId,runId:RunId,input:NewSource):Promise<Result<{source:SourceItem;created:boolean}>>;
 archive(ctx:SourceContext,id:SourceId,confirmation?:string):Promise<Result<SourceItem>>;
 retry(ctx:SourceContext,id:SourceId,runId:RunId):Promise<Result<SourceItem>>;
 queued(ctx:SourceContext):Promise<QueuedSource[]>;
}
export class SourceRegistrationService {
 private readonly active=new Map<RunId,Promise<void>>();
 private readonly stop=new AbortController();
 private failure:DomainError|undefined;
 constructor(private readonly repository:SourceRegistrationRepository,private readonly ids:IdFactory,
  private readonly connector:(ctx:SourceContext,id:SourceId,engineId?:import('../../../shared/kernel/index.js').EngineId)=>SourceConnector,
  private readonly jobs:IntrospectionJob,private readonly fail:(ctx:SourceContext,id:RunId,message:string)=>Promise<void>,private readonly events?:ProjectEvents,private readonly custody?:{ensure(ctx:SourceContext):Promise<Result<void>>}){}
 async test(_ctx:SourceContext,_ref:string,_engineId?:import('../../../shared/kernel/index.js').EngineId){
  return ok({reachable:false,reason:'Save and assign the source first. Connection testing runs automatically after the engine applies its network policy.',schemas:[] as string[]});
 }
 async create(ctx:SourceContext,input:NewSource){
  if(!this.custody)return err(new DomainError('dependency_unavailable','Token key custody is not configured. Configure custody before connecting a source.'));const secured=await this.custody.ensure(ctx);if(!secured.ok)return secured;
  const id=this.ids.create<SourceId>();
  const created=await this.repository.create(ctx,id,this.ids.create<RunId>(),input);
  if(created.ok){await notify(this.events,ctx.projectId,{type:'source.changed',sourceId:created.value.source.id});await this.resume(ctx);}
  return created.ok?ok(created.value.source):created;
 }
 async archive(ctx:SourceContext,id:SourceId,confirmation?:string){
  const result=await this.repository.archive(ctx,id,confirmation);
  if(result.ok){await notify(this.events,ctx.projectId,{type:'source.changed',sourceId:id});await notify(this.events,ctx.projectId,{type:'catalog.changed',sourceId:id});}
  return result;
 }
 async retry(ctx:SourceContext,id:SourceId){
  if(!this.custody)return err(new DomainError('dependency_unavailable','Token key custody is not configured. Configure custody before connecting a source.'));const secured=await this.custody.ensure(ctx);if(!secured.ok)return secured;
  const queued=await this.repository.retry(ctx,id,this.ids.create<RunId>());
  if(queued.ok){await notify(this.events,ctx.projectId,{type:'source.changed',sourceId:id});await this.resume(ctx);}
  return queued;
 }
 async list(ctx:SourceContext,after:SourceId|null,limit:number){await this.resume(ctx);return this.repository.list(ctx,after,limit);}
 async resume(ctx:SourceContext){
  await this.jobs.dispatchCompleted(ctx);
  for(const work of await this.repository.queued(ctx)){
   if(this.active.has(work.runId)||this.stop.signal.aborted)continue;
   const owner={...ctx,userId:work.userId};
   const done=this.execute(owner,work).catch(()=>err(new DomainError('dependency_unavailable',sourceMessages.unexpected))).then(async result=>{if(!result.ok){this.failure=result.error;await this.fail(owner,work.runId,result.error.message);}}).catch(()=>{console.warn({event:'source.job_failure',runId:work.runId});}).finally(()=>this.active.delete(work.runId));
   this.active.set(work.runId,done);
  }
 }
 private async execute(ctx:SourceContext,work:QueuedSource):Promise<Result<void>>{
  if(!this.custody)return err(new DomainError('dependency_unavailable','Token key custody is not configured. Configure custody before connecting a source.'));const secured=await this.custody.ensure(ctx);if(!secured.ok)return secured;
  const result=await this.jobs.execute(ctx,work.runId,this.stop.signal);
  if(!result.ok&&result.error.code==='conflict')return ok(undefined); // Another worker already claimed this run.
  if(!result.ok)return err(new DomainError(result.error.code,result.error.details?.cause==='engine_registry'?result.error.message:safeSourceMessage(result.error.code,result.error.message)));
  if(result.value.state==='failed')this.failure=new DomainError(result.value.errorCode??'dependency_unavailable',result.value.error??sourceMessages.unexpected);
  return ok(undefined);
 }
 async idle():Promise<Result<void>>{await Promise.allSettled(this.active.values());const failure=this.failure;this.failure=undefined;return failure?err(failure):ok(undefined);}
 async close(){this.stop.abort();await Promise.allSettled(this.active.values());}
}
