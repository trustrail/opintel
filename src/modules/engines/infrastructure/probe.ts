import {engineConnect,EngineTransportError} from '../../../shared/infrastructure/engine-transport.js';
import type {LookupFunction} from 'node:net';
import {checkServerIdentity} from 'node:tls';
import {randomUUID} from 'node:crypto';
import {readinessFailure,readinessMessages} from '../../../shared/engine-readiness.js';
import {z} from 'zod';
import {healthResponse,healthContract} from '../../../shared/sidecar-contract.js';
import {sentinel} from '../../../shared/custody-contract.js';
import {DomainError,err,ok,type ProjectId,type EngineId,type Result} from '../../../shared/kernel/index.js';
import type {EngineEndpoint,EngineProbe} from '../application/registry.js';
export class HttpsEngineProbe implements EngineProbe {
 constructor(private readonly heartbeatUrl?:string,private readonly transport:{connectTimeoutMs?:number;lookup?:LookupFunction}={}){}
 async registerEgress(endpoint:EngineEndpoint,projectId:ProjectId,engineId:EngineId){
  if(!this.heartbeatUrl)return ok(undefined);
  const result=await this.post(endpoint,'/egress/register',{requestId:randomUUID(),projectId,engineId,gatewayUrl:this.heartbeatUrl});
  if(!result.ok)return err(new DomainError('source_unavailable','Engine egress registration failed.',{cause:'engine_registry',...(result.error.details?.reason==='control_connect_timeout'?{reason:'control_connect_timeout'}:{})},true));
  return result.ok&&z.strictObject({registered:z.literal(true)}).safeParse(result.value).success?ok(undefined):err(new DomainError('source_unavailable','Engine egress registration failed.',{cause:'engine_registry'},true));
 }
 async health(e:EngineEndpoint){const r=await this.post(e,'/health',undefined);if(!r.ok)return r;const version=healthContract.safeParse(r.value);if(!version.success)return err(new DomainError('source_unavailable','Engine health response is invalid.'));if(version.data.contract!==3)return ok({contract:version.data.contract,queryEngineVersion:'',canonicalisers:[]});const p=healthResponse.safeParse(r.value);return p.success?ok(p.data):err(new DomainError('source_unavailable','Engine health response is invalid.'));}
 async sentinel(e:EngineEndpoint,projectId:ProjectId){const r=await this.post(e,'/custody/attest',{requestId:randomUUID(),projectId,payload:{}});if(!r.ok)return r;const p=z.strictObject({keyVersion:z.number().int().positive(),sentinelToken:sentinel}).safeParse(r.value);return p.success?ok({version:p.data.keyVersion,sentinel:p.data.sentinelToken}):err(new DomainError('source_unavailable','Engine key attestation failed.'));}
 private async post(e:EngineEndpoint,path:string,body:unknown):Promise<Result<unknown>>{
  const signal=AbortSignal.timeout(e.timeoutMs??9000),data=body===undefined?undefined:JSON.stringify(body);
  try{return await engineConnect(new URL(path,e.baseUrl),{method:'POST',signal,...e.tls,minVersion:'TLSv1.3',rejectUnauthorized:true,checkServerIdentity:(host,cert)=>checkServerIdentity(host,cert)??(cert.fingerprint256.replaceAll(':','')===e.tls.certificatePin?undefined:new Error('Engine pin mismatch.')),headers:data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}},data,res=>new Promise<Result<unknown>>(resolve=>{
   const chunks:Buffer[]=[];let size=0,settled=false;
   const finish=(result:Result<unknown>)=>{if(!settled){settled=true;resolve(result);}};
   const fail=()=>{if(settled)return;console.info({event:'engine.probe_refused',timestamp:new Date().toISOString(),path,stage:'response',status:res.statusCode??0});finish(err(new DomainError('source_unavailable','Engine verification failed.')));};
   res.on('error',fail);res.on('aborted',fail);res.on('data',(b:Buffer)=>{size+=b.length;if(size>1024*1024){res.destroy();fail();}else chunks.push(b);});
   res.on('end',()=>{try{
    if(!res.complete)throw new Error();const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(res.statusCode!==200){
     const diagnostic=z.object({error:z.object({code:z.literal('source_unavailable'),details:z.object({readinessReason:readinessFailure})})}).safeParse(value);
     if(path==='/health'&&res.statusCode===503&&diagnostic.success){const reason=diagnostic.data.error.details.readinessReason;finish(err(new DomainError('source_unavailable',readinessMessages[reason],{readinessReason:reason},true)));return;}
     throw new Error();
    }
    finish(ok(value));
   }catch{fail();}});
  }),{...this.transport,retryEvent:'engine.probe_connect_retry'});
  }catch(error){
   const connectTimeout=error instanceof EngineTransportError&&error.phase==='connect'&&(error.connectExpired||signal.aborted);
   console.info({event:'engine.probe_refused',timestamp:new Date().toISOString(),path,stage:'transport',phase:error instanceof EngineTransportError?error.phase:'response'});
   return connectTimeout?err(new DomainError('source_unavailable','Engine TCP connection timed out.',{cause:'engine_registry',reason:'control_connect_timeout'},true)):err(new DomainError('source_unavailable','Engine verification failed.'));
  }
 }
}
