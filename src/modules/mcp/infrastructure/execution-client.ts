import {request} from 'node:https';
import {X509Certificate} from 'node:crypto';
import {checkServerIdentity} from 'node:tls';
import {z} from 'zod';
import {DomainError,err,ok,type Result} from '../../../shared/kernel/index.js';
import {executionRequest,executionResponse,validationResponse,type ExecutionRequest} from '../../../shared/execution-contract.js';
import {healthResponse} from '../../../shared/sidecar-contract.js';
import {serviceErrorEnvelope} from '../../../shared/error-contract.js';
import type {SidecarOptions} from '../../sources/index.js';
import type {QueryExecutionPort,QueryValidationPort} from '../application/query-ports.js';
/** No result cache, retries or alternate data path. Partial responses are never decoded. */
export class SidecarQueryExecution implements QueryExecutionPort,QueryValidationPort {
 private readonly base:URL;private readonly pin:string;
 constructor(private readonly options:SidecarOptions){this.base=new URL(options.baseUrl);if(this.base.protocol!=='https:'||this.base.username||this.base.password||this.base.search||this.base.hash)throw new Error('Query execution requires an HTTPS sidecar URL.');this.pin=new X509Certificate(options.tls.pinnedCertificate).fingerprint256;}
 async health(signal?:AbortSignal){const result=await this.call('/health',undefined,healthResponse,this.options.timeoutMs??9000,signal);if(!result.ok)return result;return result.value.contract===2?ok({queryEngineVersion:result.value.queryEngineVersion}):err(new DomainError('dependency_unavailable','The sidecar contract is incompatible with query execution.',{cause:'sidecar_contract_mismatch',reason:'health_contract'}));}
 execute(input:ExecutionRequest,signal?:AbortSignal){const parsed=executionRequest.safeParse(input);return parsed.success?this.call('/execute',parsed.data,executionResponse,Math.min(2147483647,parsed.data.limits.timeoutMs+2000),signal):Promise.resolve(err(new DomainError('validation_failed','Invalid execution request.')));}
 validate(input:ExecutionRequest,signal?:AbortSignal){const parsed=executionRequest.safeParse(input);return parsed.success?this.call('/validate',parsed.data,validationResponse,Math.min(2147483647,parsed.data.limits.timeoutMs+2000),signal):Promise.resolve(err(new DomainError('validation_failed','Invalid execution request.')));}
 private async call<T>(path:string,body:unknown,schema:z.ZodType<T>,timeoutMs:number,parent?:AbortSignal):Promise<Result<T>>{
  const timeout=AbortSignal.timeout(timeoutMs),signal=parent?AbortSignal.any([timeout,parent]):timeout;
  let responseStarted=false;let responseReason:string|undefined;
  try{
   const response=await new Promise<{status:number;body:unknown}>((resolve,reject)=>{
    const encoded=body===undefined?undefined:JSON.stringify(body);
    const req=request(new URL(path,this.base),{method:'POST',agent:false,signal,minVersion:'TLSv1.3',rejectUnauthorized:true,ca:this.options.tls.ca,cert:this.options.tls.cert,key:this.options.tls.key,
     checkServerIdentity:(host,cert)=>checkServerIdentity(host,cert)??(cert.fingerprint256===this.pin?undefined:new Error('Sidecar pin mismatch.')),
     headers:encoded===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(encoded)}},res=>{
      responseStarted=true;
      const chunks:Buffer[]=[];let size=0;res.on('error',reject);res.on('aborted',()=>{responseReason??='response_incomplete';reject(new Error('Incomplete sidecar response.'));});
      res.on('data',(b:Buffer)=>{size+=b.length;if(size>16*1024*1024){responseReason='response_oversized';res.destroy(new Error('Query response is too large.'));return;}chunks.push(b);});
      res.on('end',()=>{try{responseReason=!res.complete?'response_incomplete':!/^application\/json(?:;|$)/iu.test(res.headers['content-type']??'')?'response_content_type':undefined;if(responseReason)throw new Error('Invalid response');responseReason='response_json';const decoded:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));responseReason=undefined;resolve({status:res.statusCode??0,body:decoded});}catch{reject(new Error('Invalid sidecar response.'));}});
     });req.on('error',reject);req.end(encoded);
   });
   if(response.status!==200){const parsed=serviceErrorEnvelope.extend({error:serviceErrorEnvelope.shape.error.extend({details:z.record(z.string(),z.json()).optional()})}).safeParse(response.body);if(!parsed.success){responseReason='response_error_envelope';throw new Error('Invalid error envelope.');}return err(new DomainError(parsed.data.error.code,parsed.data.error.message,parsed.data.error.details,parsed.data.error.retryable));}
   const parsed=schema.safeParse(response.body);return parsed.success?ok(parsed.data):err(new DomainError('dependency_unavailable','The sidecar returned an invalid query result.',{cause:path==='/health'?'sidecar_contract_mismatch':'unclassified',...(path==='/health'?{reason:'health_contract'}:{reason:'result_contract'})}));
  }catch{return err(new DomainError('source_unavailable',signal.aborted?'The query was cancelled or exceeded its deadline. No partial result was returned.':'The sidecar is unreachable or its response was incomplete. No cached or partial result was returned.',{cause:signal.aborted?'interruption_unclassified':responseStarted?'sidecar_response_unusable':'sidecar_transport_failed',...(responseReason?{reason:responseReason}:{})},true));}
 }
}
