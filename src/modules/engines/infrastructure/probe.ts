import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {randomUUID} from 'node:crypto';
import {readinessFailure,readinessMessages} from '../../../shared/engine-readiness.js';
import {z} from 'zod';
import {healthResponse,healthContract} from '../../../shared/sidecar-contract.js';
import {sentinel} from '../../../shared/custody-contract.js';
import {DomainError,err,ok,type ProjectId,type EngineId,type Result} from '../../../shared/kernel/index.js';
import type {EngineEndpoint,EngineProbe} from '../application/registry.js';
export class HttpsEngineProbe implements EngineProbe {
 constructor(private readonly heartbeatUrl?:string){}
 async registerEgress(endpoint:EngineEndpoint,projectId:ProjectId,engineId:EngineId){
  if(!this.heartbeatUrl)return ok(undefined);
  const result=await this.post(endpoint,'/egress/register',{requestId:randomUUID(),projectId,engineId,gatewayUrl:this.heartbeatUrl});
  return result.ok&&z.strictObject({registered:z.literal(true)}).safeParse(result.value).success?ok(undefined):err(new DomainError('source_unavailable','Engine egress registration failed.',{cause:'engine_registry'},true));
 }
 async health(e:EngineEndpoint){const r=await this.post(e,'/health',undefined);if(!r.ok)return r;const version=healthContract.safeParse(r.value);if(!version.success)return err(new DomainError('source_unavailable','Engine health response is invalid.'));if(version.data.contract!==3)return ok({contract:version.data.contract,queryEngineVersion:'',canonicalisers:[]});const p=healthResponse.safeParse(r.value);return p.success?ok(p.data):err(new DomainError('source_unavailable','Engine health response is invalid.'));}
 async sentinel(e:EngineEndpoint,projectId:ProjectId){const r=await this.post(e,'/custody/attest',{requestId:randomUUID(),projectId,payload:{}});if(!r.ok)return r;const p=z.strictObject({keyVersion:z.number().int().positive(),sentinelToken:sentinel}).safeParse(r.value);return p.success?ok({version:p.data.keyVersion,sentinel:p.data.sentinelToken}):err(new DomainError('source_unavailable','Engine key attestation failed.'));}
 private post(e:EngineEndpoint,path:string,body:unknown):Promise<Result<unknown>>{return new Promise(resolve=>{
  const data=body===undefined?undefined:JSON.stringify(body);
  const req=request(new URL(path,e.baseUrl),{method:'POST',agent:false,signal:AbortSignal.timeout(e.timeoutMs??9000),...e.tls,minVersion:'TLSv1.3',rejectUnauthorized:true,checkServerIdentity:(host,cert)=>checkServerIdentity(host,cert)??(cert.fingerprint256.replaceAll(':','')===e.tls.certificatePin?undefined:new Error('Engine pin mismatch.')),headers:data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}},res=>{
   const chunks:Buffer[]=[];let size=0;const fail=()=>resolve(err(new DomainError('source_unavailable','Engine verification failed.')));res.on('error',fail);res.on('data',(b:Buffer)=>{size+=b.length;if(size>1024*1024){res.destroy();fail();}else chunks.push(b);});res.on('end',()=>{try{if(!res.complete)throw new Error();const body:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200){const diagnostic=z.object({error:z.object({code:z.literal('source_unavailable'),details:z.object({readinessReason:readinessFailure})})}).safeParse(body);if(path==='/health'&&res.statusCode===503&&diagnostic.success){const reason=diagnostic.data.error.details.readinessReason;resolve(err(new DomainError('source_unavailable',readinessMessages[reason],{readinessReason:reason},true)));return;}throw new Error();}resolve(ok(body));}catch{fail();}});
  });req.on('error',()=>resolve(err(new DomainError('source_unavailable','Engine verification failed.'))));req.end(data);
 });}
}
