import type { ProjectEvents } from '../../../platform/sse/port.js';
import { randomUUID } from 'node:crypto';
import { DomainError,err,UuidV7IdFactory } from '../../../shared/kernel/index.js';
import { SourceRegistrationService } from '../application/source-registration.js';
import { IntrospectionJob } from '../application/introspection-job.js';
import { PostgresIntrospectionStore } from './postgres-introspection-store.js';
import { PostgresSourceRegistrationRepository } from './source-registration-repository.js';
import { SidecarSourceConnector,type SidecarOptions } from './sidecar-source-connector.js';
export function createSourceRuntime(options:SidecarOptions, events?:ProjectEvents){
 const ids=new UuidV7IdFactory();const store=new PostgresIntrospectionStore(ids,events);
 const connector=(ctx:{projectId:import('../../../shared/kernel/index.js').ProjectId},id:import('../../../shared/kernel/index.js').SourceId)=>new SidecarSourceConnector('postgres',{projectId:ctx.projectId,sourceId:id,requestId:randomUUID(),sampling:async()=>err(new DomainError('forbidden','Sampling is not part of source registration.'))},options);
 const jobs=new IntrospectionJob(store,source=>connector(source,source.id));
 return new SourceRegistrationService(new PostgresSourceRegistrationRepository(),ids,connector,jobs,async(ctx,id,message)=>{const run=await store.read(ctx,id);if(run.ok&&run.value.state==='queued')await store.advance(ctx,id,'queued','connecting');await store.fail(ctx,id,message,false);},events);
}
