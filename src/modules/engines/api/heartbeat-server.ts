import {createServer} from 'node:https';
import {randomUUID} from 'node:crypto';
import type {TLSSocket} from 'node:tls';
import {egressHeartbeat,egressPolicy} from '../../../shared/engine-egress-contract.js';
import type {EngineEgress} from '../application/egress.js';
import type {ApplicationTls} from '../application/registry.js';
export function createEngineHeartbeatServer(tls:ApplicationTls,service:EngineEgress){
 const route={path:'/engine-heartbeat',permission:'verified_engine_certificate' as const};
 return createServer({...tls,minVersion:'TLSv1.3',requestCert:true,rejectUnauthorized:true,requestTimeout:10000},(req,res)=>{
  const socket=req.socket as TLSSocket;
  if(!socket.authorized){socket.destroy();return;}
  const requestId=randomUUID();
  const fail=(status:number,code:string,message:string)=>{console[status>=500?'warn':'info']({event:'engine.heartbeat_refused',timestamp:new Date().toISOString(),reason:code,requestId});res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:{code,message,requestId,retryable:status>=500}}));};
  if(route.permission!=='verified_engine_certificate')throw new Error('Heartbeat permission is missing.');
  if(req.url!==route.path||req.method!=='POST'){req.resume();fail(404,'not_found','The endpoint does not exist.');return;}
  if(!/^application\/json(?:;|$)/iu.test(req.headers['content-type']??'')){req.resume();fail(415,'validation_failed','A JSON heartbeat is required.');return;}
  void(async()=>{
   try{
    const chunks:Buffer[]=[];let length=0;
    for await(const chunk of req){const bytes=Buffer.from(chunk as Uint8Array);length+=bytes.length;if(length>1024*1024){fail(413,'validation_failed','The heartbeat is too large.');req.destroy();return;}chunks.push(bytes);}
    let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{fail(400,'validation_failed','The heartbeat is not valid JSON.');return;}
    const parsed=egressHeartbeat.safeParse(body);if(!parsed.success){fail(400,'validation_failed','The heartbeat did not pass validation.');return;}
    const result=await service.heartbeat(socket.getPeerCertificate().fingerprint256,parsed.data);
    if(!result.ok){fail(result.error.code==='forbidden'?403:result.error.code==='validation_failed'?400:503,result.error.code,result.error.message);return;}
    if(process.env.LOG_LEVEL==='debug')console.debug({level:'debug',event:'engine.heartbeat_accepted',timestamp:new Date().toISOString(),engineId:parsed.data.engineId,projectId:parsed.data.projectId,appliedVersion:parsed.data.appliedVersion,policyVersion:result.value.version});
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(egressPolicy.parse(result.value)));
   }catch{if(!res.headersSent)fail(503,'dependency_unavailable','The engine heartbeat could not be processed.');else res.destroy();}
  })();
 });
}
