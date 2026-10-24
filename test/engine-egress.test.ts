import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {PostgresEngineRepository,PostgresEngineEgress,EngineEgress} from '../src/modules/engines/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {EngineId,SourceId,RunId} from '../src/shared/kernel/index.js';
import {PostgresSourceRegistrationRepository} from '../src/modules/sources/infrastructure/source-registration-repository.js';
const pin='A'.repeat(64);
async function fixture(){
 const f=await policyFixture(1),engines=new PostgresEngineRepository();
 const engine=unwrap(await engines.register(f.ctx,{name:'Egress test',address:'https://engine.example',certificatePin:pin}));
 await withTenant(f.ctx,tx=>tx.query("UPDATE engine SET verified_at=now(),contract_version=3,health='healthy' WHERE id=$1",[engine.id]));
 const repository=new PostgresEngineEgress(),resume=vi.fn(async()=>{}),service=new EngineEgress(repository,resume);
 return {...f,engine,engines,repository,resume,service};
}
it('DEP-006: unknown, wrong-pin, unverified and cross-project heartbeat identities refuse',async()=>{
 const f=await fixture(),other=await fixture();
 const input={projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null};
 for(const [peer,body] of [[pin,{...input,engineId:EngineId(randomUUID())}],['B'.repeat(64),input],[pin,{...input,projectId:other.ctx.projectId}]] as const){expect(await f.service.heartbeat(peer,body)).toMatchObject({ok:false,error:{code:'forbidden'}});}
 await withTenant(f.ctx,tx=>tx.query('UPDATE engine SET verified_at=NULL WHERE id=$1',[f.engine.id]));
 expect(await f.service.heartbeat(pin,input)).toMatchObject({ok:false,error:{code:'forbidden'}});
 expect(f.resume).not.toHaveBeenCalled();
});
it('pending source stays saved and queued until its exact current policy is acknowledged',async()=>{
 const f=await fixture(),sources=new PostgresSourceRegistrationRepository();
 const id=SourceId(randomUUID());
 const created=unwrap(await sources.create(f.ctx,id,RunId(randomUUID()),{engineId:f.engine.id,name:'Assigned source',kind:'postgres',credentialRef:'secret://test/new',includeSchemas:['public'],samplingConsent:false,receivesLandings:false,landingStrategy:null},null));
 expect(created.source.status).toBe('pending_egress');expect(await sources.queued(f.ctx)).toEqual([]);
 const input={projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null};
 const policy=unwrap(await f.service.heartbeat(pin,input));
 expect(policy.assignments).toEqual([{sourceId:id,credentialRef:'secret://test/new'}]);
 expect(f.resume).not.toHaveBeenCalled();
 await f.service.heartbeat(pin,{...input,appliedVersion:'0'.repeat(64)});
 expect(await sources.queued(f.ctx)).toEqual([]);
 unwrap(await f.service.heartbeat(pin,{...input,appliedVersion:policy.version}));
 expect((await sources.queued(f.ctx)).map(row=>row.sourceId)).toEqual([id]);expect(f.resume).toHaveBeenCalledWith(f.ctx.projectId);
 const [record]=await withTenant(f.ctx,tx=>tx.query<{version:string}>('SELECT egress_applied_version AS version FROM engine WHERE id=$1',[f.engine.id]));expect(record?.version).toBe(policy.version);
});
it('assignment changes invalidate old acknowledgments and archived sources leave the policy',async()=>{
 const f=await fixture(),input={projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null};
 const previous=unwrap(await f.service.heartbeat(pin,input));
 unwrap(await f.engines.assign(f.ctx,f.source,f.engine.id));
 const next=unwrap(await f.service.heartbeat(pin,{...input,appliedVersion:previous.version}));expect(next.version).not.toBe(previous.version);
 const [pending]=await withTenant(f.ctx,tx=>tx.query<{pending:boolean}>('SELECT egress_pending AS pending FROM data_source WHERE id=$1',[f.source]));expect(pending?.pending).toBe(true);
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='archived' WHERE id=$1",[f.source]));
 const archived=unwrap(await f.service.heartbeat(pin,{...input,appliedVersion:next.version}));expect(archived.assignments).toEqual([]);expect(f.resume).not.toHaveBeenCalled();
});
it('unresolvable assigned destinations stay saved as unreachable and retry after resolution recovers',async()=>{
 const f=await fixture(),sources=new PostgresSourceRegistrationRepository(),id=SourceId(randomUUID());
 unwrap(await sources.create(f.ctx,id,RunId(randomUUID()),{engineId:f.engine.id,name:'Missing credential',kind:'postgres',credentialRef:'secret://test/missing',includeSchemas:[],samplingConsent:false,receivesLandings:false,landingStrategy:null},null));
 const input={projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null};
 const policy=unwrap(await f.service.heartbeat(pin,input));
 unwrap(await f.service.heartbeat(pin,{...input,appliedVersion:policy.version,unreachableSourceIds:[id]}));
 expect(unwrap(await sources.list(f.ctx,null,100)).find(row=>row.id===id)?.status).toBe('unreachable');
 expect(await sources.queued(f.ctx)).toEqual([]);
 unwrap(await f.service.heartbeat(pin,{...input,appliedVersion:policy.version,unreachableSourceIds:[]}));
 expect((await sources.queued(f.ctx)).map(row=>row.sourceId)).toEqual([id]);
});
it('applied heartbeat automatically tests a saved source; connection failure preserves unreachable status',async()=>{
 const {SourceRegistrationService}=await import('../src/modules/sources/application/source-registration.js');
 const {IntrospectionJob,PostgresIntrospectionStore}=await import('../src/modules/sources/index.js');
 const {UuidV7IdFactory,ok,err,DomainError}=await import('../src/shared/kernel/index.js');
 const f=await fixture(),repository=new PostgresSourceRegistrationRepository(),ids=new UuidV7IdFactory(),store=new PostgresIntrospectionStore(ids);
 const testConnection=vi.fn(async()=>err(new DomainError('source_unavailable','Source connection unavailable.')));
 const unused=async()=>{throw new Error('No catalogue contact after failed connection');};
 const connector={kind:'postgres' as const,testConnection,introspect:unused,sampleTopValues:unused,estimateRowCount:unused,provisionDemo:unused};
 const jobs=new IntrospectionJob(store,()=>connector);
 const sources=new SourceRegistrationService(repository,ids,()=>connector,jobs,async(ctx,id,message)=>{await store.fail(ctx,id,message,true);},undefined,{ensure:async()=>ok(undefined)});
 try{
  const created=unwrap(await sources.create(f.ctx,{engineId:f.engine.id,name:'Saved before contact',kind:'postgres',credentialRef:'secret://test/offline',includeSchemas:['public'],samplingConsent:false,receivesLandings:false,landingStrategy:null}));
  expect(created.status).toBe('pending_egress');expect(testConnection).not.toHaveBeenCalled();
  const heartbeat=new EngineEgress(new PostgresEngineEgress(),async()=>{await sources.resume(f.ctx);});
  const input={projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null};
  const policy=unwrap(await heartbeat.heartbeat(pin,input));expect(testConnection).not.toHaveBeenCalled();
  unwrap(await heartbeat.heartbeat(pin,{...input,appliedVersion:policy.version}));await sources.idle();
  expect(testConnection).toHaveBeenCalledTimes(1);
  expect(unwrap(await repository.list(f.ctx,null,100)).find(row=>row.id===created.id)?.status).toBe('unreachable');
 }finally{await sources.close();}
});

it.each([true,false])('reassignment waits for current policy and normal worker settles connected=%s',async(reachable)=>{
 const {SourceRegistrationService}=await import('../src/modules/sources/application/source-registration.js');
 const {IntrospectionJob,PostgresIntrospectionStore}=await import('../src/modules/sources/index.js');
 const {UuidV7IdFactory,Timestamp,ok,err,DomainError}=await import('../src/shared/kernel/index.js');
 const f=await fixture(),repository=new PostgresSourceRegistrationRepository(),ids=new UuidV7IdFactory(),store=new PostgresIntrospectionStore(ids);
 const previousEngine=unwrap(await f.engines.register(f.ctx,{name:'Previous engine',address:'https://previous.example',certificatePin:pin}));
 await withTenant(f.ctx,async tx=>{
  await tx.query('UPDATE data_source SET engine_id=$2 WHERE id=$1',[f.source,previousEngine.id]);
  await tx.query("INSERT INTO introspection_run(id,source_id,project_id,state,include_schemas,progress) VALUES($1,$2,$3,'complete',ARRAY['public'], '{}'::jsonb)",[randomUUID(),f.source,f.ctx.projectId]);
 });
 const testConnection=vi.fn(async()=>reachable?ok(undefined):err(new DomainError('source_unavailable','Unavailable.')));
 const introspect=vi.fn(async(_ref:unknown,_include:string[])=>ok({takenAt:Timestamp(new Date()),objects:[],foreignKeys:[]}));
 const unused=async()=>{throw new Error('Unexpected sampling');};
 const connector={kind:'postgres' as const,testConnection,introspect,sampleTopValues:unused,estimateRowCount:unused,provisionDemo:unused};
 const jobs=new IntrospectionJob(store,()=>connector);
 const sources=new SourceRegistrationService(repository,ids,()=>connector,jobs,async(ctx,id,message)=>{await store.fail(ctx,id,message,true);},undefined,{ensure:async()=>ok(undefined)});
 try{
  const input={projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null};
  const heartbeat=new EngineEgress(new PostgresEngineEgress(),async()=>{await sources.resume(f.ctx);});
  const old=unwrap(await heartbeat.heartbeat(pin,input));
  unwrap(await f.engines.assign(f.ctx,f.source,f.engine.id));
  unwrap(await f.engines.assign(f.ctx,f.source,f.engine.id)); // Repeated assignment reuses queued work.
  const runs=await withTenant(f.ctx,tx=>tx.query<{id:RunId}>("SELECT id FROM introspection_run WHERE source_id=$1 AND state='queued'",[f.source]));
  expect(runs).toHaveLength(1);
  expect(await store.advance(f.ctx,runs[0]!.id,'queued','connecting')).toMatchObject({ok:false,error:{code:'conflict'}});
  expect(await repository.queued(f.ctx)).toEqual([]);
  const current=unwrap(await heartbeat.heartbeat(pin,{...input,appliedVersion:old.version}));
  expect(testConnection).not.toHaveBeenCalled();
  expect(unwrap(await repository.list(f.ctx,null,100)).find(row=>row.id===f.source)?.status).toBe('pending_egress');
  unwrap(await heartbeat.heartbeat(pin,{...input,appliedVersion:current.version}));await sources.idle();
  expect(testConnection).toHaveBeenCalledTimes(1);expect(introspect).toHaveBeenCalledTimes(reachable?1:0);
  if(reachable)expect(introspect.mock.calls[0]?.[1]).toEqual(['public']);
  expect(unwrap(await repository.list(f.ctx,null,100)).find(row=>row.id===f.source)?.status).toBe(reachable?'connected':'unreachable');
  unwrap(await heartbeat.heartbeat(pin,{...input,appliedVersion:current.version}));await sources.idle();expect(testConnection).toHaveBeenCalledTimes(1);
 }finally{await sources.close();}
});

it('invalid heartbeat destination reports do not change the recorded applied version',async()=>{
 const f=await fixture(),input={projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null};
 const policy=unwrap(await f.service.heartbeat(pin,input));
 const rejected=await f.service.heartbeat(pin,{...input,appliedVersion:policy.version,unreachableSourceIds:[SourceId(randomUUID())]});
 expect(rejected).toMatchObject({ok:false,error:{code:'validation_failed'}});
 const [engine]=await withTenant(f.ctx,tx=>tx.query<{version:string|null}>('SELECT egress_applied_version AS version FROM engine WHERE id=$1',[f.engine.id]));
 expect(engine?.version).toBeNull();expect(f.resume).not.toHaveBeenCalled();
});
