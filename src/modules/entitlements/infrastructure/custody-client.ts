import { X509Certificate,randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { z } from 'zod';
import { DomainError,err,ok,type ProjectId,type Result } from '../../../shared/kernel/index.js';
import { custodyEnvelope,custodyOperations,safeCustodyMessage,type CustodyOperation,type CustodyResponse } from '../../../shared/custody-contract.js';
import { healthResponse } from '../../../shared/sidecar-contract.js';
import { serviceErrorEnvelope } from '../../../shared/error-contract.js';
import type { SidecarOptions } from '../../sources/index.js';
import type { CustodyPort } from '../application/key-custody.js';
export class SidecarCustodyClient implements CustodyPort {
 private checked=false;private readonly pin:string;private readonly url:URL;
 constructor(private readonly options:SidecarOptions){this.url=new URL(options.baseUrl);if(this.url.protocol!=='https:'||this.url.username||this.url.password)throw new Error('Custody requires a pinned HTTPS sidecar.');this.pin=new X509Certificate(options.tls.pinnedCertificate).fingerprint256;}
 async call<K extends CustodyOperation>(projectId:ProjectId,operation:K,payload:z.input<(typeof custodyOperations)[K]['request']>):Promise<Result<CustodyResponse<K>>>{
  const parsed=custodyOperations[operation].request.safeParse(payload);if(!parsed.success)return err(new DomainError('validation_failed','Invalid custody request.'));
  const signal=AbortSignal.timeout(this.options.timeoutMs??9000);
  try{
   if(!this.checked){const health=healthResponse.parse(await this.post('/health',undefined,signal));if(health.contract!==1)return err(new DomainError('dependency_unavailable','Sidecar contract mismatch: custody requires contract 1.'));this.checked=true;}
   const body=custodyEnvelope.parse({requestId:randomUUID(),projectId,payload:parsed.data});
   const value=custodyOperations[operation].response.parse(await this.post('/custody/'+operation,body,signal));
   return ok(value as CustodyResponse<K>);
  }catch(error){return err(error instanceof DomainError?error:new DomainError('dependency_unavailable','The custody sidecar could not be reached or returned an invalid response. Check its connection and retry.',undefined,true));}
 }
 private post(path:string,body:unknown,signal:AbortSignal):Promise<unknown>{return new Promise((resolve,reject)=>{
  const encoded=body===undefined?undefined:JSON.stringify(body);
  const req=request(new URL(path,this.url),{method:'POST',agent:false,signal,ca:this.options.tls.ca,cert:this.options.tls.cert,key:this.options.tls.key,minVersion:'TLSv1.3',rejectUnauthorized:true,
   checkServerIdentity:(host,cert)=>checkServerIdentity(host,cert)??(cert.fingerprint256===this.pin?undefined:new Error('Custody certificate pin mismatch.')),
   headers:encoded?{'content-type':'application/json','content-length':Buffer.byteLength(encoded)}:{}},res=>{
    const chunks:Buffer[]=[];let length=0;res.on('error',reject);res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>1024*1024){res.destroy(new Error('Custody response too large.'));return;}chunks.push(chunk);});
    res.on('end',()=>{try{const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200){const error=serviceErrorEnvelope.parse(value).error;reject(new DomainError(error.code,safeCustodyMessage(error.message),undefined,error.retryable));}else resolve(value);}catch{reject(new Error('Invalid custody response.'));}});
   });req.on('error',reject);req.end(encoded);
 });}
}
