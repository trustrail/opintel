import {request} from 'node:https';
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
  const deadline=performance.now()+(e.timeoutMs??9000);
  let outcome=await this.attempt(e,path,body,deadline,this.transport.connectTimeoutMs??1000);
  // These endpoints are read-only or idempotent registration. Fresh TCP tuples
  // may recover dropped SYNs; TLS/pin and response failures are never retried.
  // At most four connections share the original deadline. The final attempt
  // gets all remaining time instead of extending the operation budget.
  for(let retry=0;retry<3&&outcome.connectExpired&&performance.now()<deadline;retry++){
   console.info({event:'engine.probe_connect_retry',timestamp:new Date().toISOString(),path,attempt:retry+2});
   outcome=await this.attempt(e,path,body,deadline,retry<2?this.transport.connectTimeoutMs??1000:undefined);
  }
  return outcome.result;
 }
 private attempt(e:EngineEndpoint,path:string,body:unknown,deadline:number,connectTimeoutMs?:number):Promise<{result:Result<unknown>;connectExpired:boolean;phase:string}>{return new Promise(resolve=>{
  const data=body===undefined?undefined:JSON.stringify(body),started=performance.now();
  let phase='connect',connectExpired=false,settled=false,connectTimer:ReturnType<typeof setTimeout>|undefined;
  const finish=(result:Result<unknown>)=>{if(settled)return;settled=true;if(connectTimer)clearTimeout(connectTimer);resolve({result,connectExpired,phase});};
  const unavailable=()=>err(new DomainError('source_unavailable','Engine verification failed.'));
  const req=request(new URL(path,e.baseUrl),{method:'POST',agent:false,signal:AbortSignal.timeout(Math.max(1,Math.ceil(deadline-performance.now()))),...e.tls,...(this.transport.lookup?{lookup:this.transport.lookup}:{}),minVersion:'TLSv1.3',rejectUnauthorized:true,checkServerIdentity:(host,cert)=>checkServerIdentity(host,cert)??(cert.fingerprint256.replaceAll(':','')===e.tls.certificatePin?undefined:new Error('Engine pin mismatch.')),headers:data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}},res=>{
   phase='body';const chunks:Buffer[]=[];let size=0;
   const fail=()=>{if(settled)return;console.info({event:'engine.probe_refused',timestamp:new Date().toISOString(),path,stage:'response',status:res.statusCode??0});finish(unavailable());};
   res.on('error',fail);res.on('data',(b:Buffer)=>{size+=b.length;if(size>1024*1024){res.destroy();fail();}else chunks.push(b);});
   res.on('end',()=>{try{
    if(!res.complete)throw new Error();const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(res.statusCode!==200){
     const diagnostic=z.object({error:z.object({code:z.literal('source_unavailable'),details:z.object({readinessReason:readinessFailure})})}).safeParse(value);
     if(path==='/health'&&res.statusCode===503&&diagnostic.success){const reason=diagnostic.data.error.details.readinessReason;finish(err(new DomainError('source_unavailable',readinessMessages[reason],{readinessReason:reason},true)));return;}
     throw new Error();
    }
    finish(ok(value));
   }catch{fail();}});
  });
  req.on('error',error=>{if(settled)return;if(!connectExpired)console.info({event:'engine.probe_refused',timestamp:new Date().toISOString(),path,stage:'transport',phase,elapsedMs:Math.round(performance.now()-started),reason:'code'in error&&['ABORT_ERR','ECONNRESET','ECONNREFUSED','ETIMEDOUT'].includes(String(error.code))?String(error.code):'other'});finish(phase==='connect'&&(connectExpired||'code'in error&&error.code==='ABORT_ERR')?err(new DomainError('source_unavailable','Engine TCP connection timed out.',{cause:'engine_registry',reason:'control_connect_timeout'},true)):unavailable());});
  req.on('socket',socket=>{socket.once('connect',()=>{phase='tls';if(connectTimer)clearTimeout(connectTimer);});socket.once('secureConnect',()=>{phase='response';});});
  if(connectTimeoutMs!==undefined){connectTimer=setTimeout(()=>{if(phase==='connect'&&!settled){connectExpired=true;req.destroy(new Error('Engine TCP connection deadline'));}},Math.max(1,Math.min(connectTimeoutMs,deadline-performance.now())));connectTimer.unref();}
  req.end(data);
 });}
}
