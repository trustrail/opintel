import {DomainError,err,ok,type EngineId,type ProjectId,type UserId,type SourceId,type Result} from '../../../shared/kernel/index.js';
import type {EngineRegistration,EngineView} from '../../../shared/api/engines.js';
export type EngineContext={projectId:ProjectId;userId:UserId};
export type EngineRecord=Omit<EngineView,'sources'>;
export type ApplicationTls={ca:string;cert:string;key:string};
export type EngineEndpoint={baseUrl:string;tls:ApplicationTls&{certificatePin:string};timeoutMs?:number};
export interface EngineRepository {
 update(ctx:EngineContext,id:EngineId,input:EngineRegistration):Promise<Result<void>>;
 register(ctx:EngineContext,input:EngineRegistration):Promise<Result<EngineRecord>>;
 get(ctx:EngineContext,id:EngineId):Promise<Result<EngineRecord>>;
 list(ctx:EngineContext,after:EngineId|null,limit:number):Promise<EngineView[]>;
 health(ctx:EngineContext,id:EngineId,value:{contractVersion:number|null;health:EngineView['health'];message:string|null;verified:boolean;address:string;certificatePin:string;name:string}):Promise<void>;
 custody(ctx:EngineContext):Promise<Result<EngineRecord>>;
 designate(ctx:EngineContext,id:EngineId):Promise<Result<void>>;
 source(ctx:EngineContext,id:SourceId):Promise<Result<{id:SourceId;name:string;engineId:EngineId|null;tokenized:boolean}>>;
 assign(ctx:EngineContext,source:SourceId,id:EngineId):Promise<Result<void>>;
 key(ctx:EngineContext):Promise<{version:number;sentinel:string}|null>;
}
export interface EngineProbe {
 health(endpoint:EngineEndpoint):Promise<Result<{contract:number;queryEngineVersion:string;canonicalisers:string[]}>>;
 sentinel(endpoint:EngineEndpoint,project:ProjectId):Promise<Result<{version:number|null;sentinel:string|null}>>;
}
export const engineRefusal=(message:string)=>err(new DomainError('source_unavailable',message,{cause:'engine_registry'},false));
export class EngineRegistry {
 constructor(private readonly repository:EngineRepository,private readonly probe:EngineProbe,private readonly tls:ApplicationTls){}
 endpoint(record:EngineRecord):EngineEndpoint{return {baseUrl:record.address,tls:{...this.tls,certificatePin:record.certificatePin}};}
 update(ctx:EngineContext,id:EngineId,input:EngineRegistration){return this.repository.update(ctx,id,input);}
 register(ctx:EngineContext,input:EngineRegistration){return this.repository.register(ctx,input);}
 list(ctx:EngineContext,after:EngineId|null,limit:number){return this.repository.list(ctx,after,limit);}
 async verify(ctx:EngineContext,id:EngineId){
  const record=await this.repository.get(ctx,id);if(!record.ok)return record;
  const result=await this.probe.health(this.endpoint(record.value));
  if(!result.ok){await this.repository.health(ctx,id,{address:record.value.address,certificatePin:record.value.certificatePin,name:record.value.name,contractVersion:null,health:'unavailable',message:'Verification failed. Check the address, certificate pin and application TLS trust.',verified:false});return engineRefusal(`Engine ${record.value.name} could not be verified. Check its address, certificate pin and application TLS trust.`);}
  const matches=result.value.contract===2;
  await this.repository.health(ctx,id,{address:record.value.address,certificatePin:record.value.certificatePin,name:record.value.name,contractVersion:result.value.contract,health:matches?'healthy':'contract_mismatch',message:matches?null:'This application requires engine contract 2.',verified:matches});
  if(matches){const current=await this.repository.get(ctx,id);if(!current.ok)return current;if(current.value.address!==record.value.address||current.value.certificatePin!==record.value.certificatePin||!current.value.verifiedAt)return engineRefusal('Engine configuration changed during verification. Test its connection again.');return current;}
  return engineRefusal(`Engine ${record.value.name} reports contract ${result.value.contract}; this application requires contract 2.`);
 }
 async ready(ctx:EngineContext,id:EngineId){const r=await this.repository.get(ctx,id);if(!r.ok)return r;if(!r.value.verifiedAt)return engineRefusal(`Engine ${r.value.name} has not passed verification. Test its connection in Settings before assigning or using sources.`);return this.verify(ctx,id);}
 async tokenReady(ctx:EngineContext,record:EngineRecord){
  const expected=await this.repository.key(ctx);if(!expected)return engineRefusal(`Engine ${record.name} cannot serve tokenized data: the project has no recorded token key.`);
  const actual=await this.probe.sentinel(this.endpoint(record),ctx.projectId);
  if(!actual.ok||actual.value.version!==expected.version||actual.value.sentinel!==expected.sentinel)return engineRefusal(`Engine ${record.name} cannot serve tokenized data: its key version or sentinel does not match the project's recorded key. Ask the operator to provision the matching key and verify again.`);
  return ok(undefined);
 }
 async forSource(ctx:EngineContext,id:SourceId,tokenized=false){
  const s=await this.repository.source(ctx,id);if(!s.ok)return s;
  if(!s.value.engineId)return engineRefusal(`Source ${s.value.name} has no assigned engine. Assign a verified engine in Settings before introspecting or querying it.`);
  const r=await this.ready(ctx,s.value.engineId);if(!r.ok)return r;
  if(tokenized){const t=await this.tokenReady(ctx,r.value);if(!t.ok)return t;}
  return ok(this.endpoint(r.value));
 }
 async forEngine(ctx:EngineContext,id:EngineId,checkKey=false){const r=await this.ready(ctx,id);if(!r.ok)return r;if(checkKey){const t=await this.tokenReady(ctx,r.value);if(!t.ok)return t;}return ok(this.endpoint(r.value));}
 async forCustody(ctx:EngineContext){const r=await this.repository.custody(ctx);if(!r.ok)return r;return this.forEngine(ctx,r.value.id);}
 async designate(ctx:EngineContext,id:EngineId){const r=await this.ready(ctx,id);if(!r.ok)return r;const key=await this.repository.key(ctx);if(key){const t=await this.tokenReady(ctx,r.value);if(!t.ok)return t;}return this.repository.designate(ctx,id);}
 async assign(ctx:EngineContext,source:SourceId,id:EngineId){const s=await this.repository.source(ctx,source);if(!s.ok)return s;const r=await this.ready(ctx,id);if(!r.ok)return r;if(s.value.tokenized){const t=await this.tokenReady(ctx,r.value);if(!t.ok)return t;}return this.repository.assign(ctx,source,id);}
}
