import {egressControlAddress} from './control-address.js';
import {request} from 'node:http';
import {egressRegistration,egressRegistered} from '../../../src/shared/engine-egress-contract.js';
import {DomainError,err,ok,type Result} from '../../../src/shared/kernel/index.js';
export function registerEgress(body:unknown):Promise<Result<unknown>>{
 const parsed=egressRegistration.safeParse(body);
 if(!parsed.success)return Promise.resolve(err(new DomainError('validation_failed','Invalid engine egress registration.')));
 return new Promise(resolve=>{
  let settled=false;
  const fail=(registrationCause:'timeout'|'socket'|'status'|'malformed',status?:number,error?:unknown)=>{
   if(settled)return;settled=true;
   const nativeErrorCode=error instanceof Error&&'code' in error&&typeof error.code==='string'&&/^[A-Z][A-Z0-9_]+$/u.test(error.code)?error.code:undefined;
   console.warn({event:'engine.egress_registration_failed',timestamp:new Date().toISOString(),requestId:parsed.data.requestId,registrationCause,...(status===undefined?{}:{status}),...(nativeErrorCode?{nativeErrorCode}:{})});
   resolve(err(new DomainError('dependency_unavailable',`Engine egress registration failed (${registrationCause}).`,{registrationCause,...(status===undefined?{}:{status}),...(nativeErrorCode?{nativeErrorCode}:{})},true)));
  };
  const signal=AbortSignal.timeout(5000);
  const data=JSON.stringify(parsed.data);
  const req=request({socketPath:egressControlAddress,path:'/register',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(data)},signal},res=>{
   const chunks:Buffer[]=[];let size=0;res.on('error',error=>fail(signal.aborted?'timeout':'socket',undefined,error));res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>4096){fail('malformed');res.destroy();}else chunks.push(chunk);});res.on('end',()=>{try{const result=egressRegistered.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(res.statusCode!==200)fail('status',res.statusCode);else if(!result.success)fail('malformed');else if(!settled){settled=true;resolve(ok(result.data));}}catch{fail(res.statusCode===200?'malformed':'status',res.statusCode);}});
  });req.on('error',error=>fail(signal.aborted?'timeout':'socket',undefined,error));req.end(data);
 });
}
