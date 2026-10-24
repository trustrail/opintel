import {egressControlAddress} from './control-address.js';
import {request} from 'node:http';
import {egressRegistration,egressRegistered} from '../../../src/shared/engine-egress-contract.js';
import {DomainError,err,ok,type Result} from '../../../src/shared/kernel/index.js';
export function registerEgress(body:unknown):Promise<Result<unknown>>{
 const parsed=egressRegistration.safeParse(body);
 if(!parsed.success)return Promise.resolve(err(new DomainError('validation_failed','Invalid engine egress registration.')));
 return new Promise(resolve=>{
  const fail=()=>resolve(err(new DomainError('dependency_unavailable','Engine egress controller is unavailable.',undefined,true)));
  const data=JSON.stringify(parsed.data);
  const req=request({socketPath:egressControlAddress,path:'/register',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(data)},signal:AbortSignal.timeout(5000)},res=>{
   const chunks:Buffer[]=[];let size=0;res.on('error',fail);res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>4096){res.destroy();fail();}else chunks.push(chunk);});res.on('end',()=>{try{const result=egressRegistered.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(res.statusCode===200&&result.success)resolve(ok(result.data));else fail();}catch{fail();}});
  });req.on('error',fail);req.end(data);
 });
}
