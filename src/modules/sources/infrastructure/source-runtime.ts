import { KeyCustodyService,PostgresCustodyRepository } from '../../entitlements/index.js';
import {RegistryCustodyClient,registryConnector,type EngineRegistry} from '../../engines/index.js';
import type { ProjectEvents } from '../../../platform/sse/port.js';
import { randomUUID } from 'node:crypto';
import { DomainError,err,UuidV7IdFactory } from '../../../shared/kernel/index.js';
import { SourceRegistrationService } from '../application/source-registration.js';
import { IntrospectionJob } from '../application/introspection-job.js';
import { PostgresIntrospectionStore } from './postgres-introspection-store.js';
import { PostgresSourceRegistrationRepository } from './source-registration-repository.js';

export function createSourceRuntime(registry:EngineRegistry, events?:ProjectEvents){
 const custody=new KeyCustodyService(new PostgresCustodyRepository(),new RegistryCustodyClient(registry),{checkMany:async()=>[]} as Pick<import('../../authz/index.js').AuthorizationPort,'checkMany'>);
 const ids=new UuidV7IdFactory();const store=new PostgresIntrospectionStore(ids,events);
 const connector=(ctx:import('../application/source-registration.js').SourceContext,id:import('../../../shared/kernel/index.js').SourceId,engineId?:import('../../../shared/kernel/index.js').EngineId)=>registryConnector(registry,ctx,{projectId:ctx.projectId,sourceId:id,requestId:randomUUID(),sampling:async()=>err(new DomainError('forbidden','Sampling is not part of source registration.'))},engineId);
 const jobs=new IntrospectionJob(store,(source,_run,ctx)=>connector(ctx,source.id));
 return new SourceRegistrationService(new PostgresSourceRegistrationRepository(),ids,connector,jobs,async(ctx,id,message)=>{const run=await store.read(ctx,id);if(run.ok&&run.value.state==='queued')await store.advance(ctx,id,'queued','connecting');await store.fail(ctx,id,message,false);},events,custody);
}
