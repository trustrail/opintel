import {createServer} from 'node:https';
import {X509Certificate,randomUUID} from 'node:crypto';
import type {Socket} from 'node:net';
import type {TLSSocket} from 'node:tls';
import {readinessMessages,type ReadinessFailure} from '../../src/shared/engine-readiness.js';
import type {SidecarConfig,SidecarTls} from '../config.js';
/** Supervisor-only status listener. It has no execution or source capabilities. */
export async function unavailableEngine(config:SidecarConfig,tls:SidecarTls,reason:ReadinessFailure){
 const route={path:'/health',permission:'pinned_application_certificate'} as const;
 if(route.permission!=='pinned_application_certificate')throw new Error('Diagnostic route lacks permission.');
 const pin=new X509Certificate(tls.clientPin).fingerprint256,sockets=new Set<Socket>();
 const server=createServer({...tls,minVersion:'TLSv1.3',requestCert:true,rejectUnauthorized:true},(req,res)=>{
  const socket=req.socket as TLSSocket;
  if(!socket.authorized||socket.getPeerCertificate()?.fingerprint256!==pin){socket.destroy();return;}
  const health=req.url===route.path&&req.method==='POST';
  req.resume();res.writeHead(503,{'content-type':'application/json','cache-control':'no-store','connection':'close'});
  // A request received by this responder cannot touch sources or keys: it has
  // no execution or source-reading capabilities. This proof applies only to
  // this request, never to a request interrupted in the departed child.
  res.end(JSON.stringify({error:{code:'source_unavailable',message:health?readinessMessages[reason]:'The registered Engine is unavailable.',requestId:randomUUID(),retryable:true,details:{cause:'engine_registry',tokenKeyVersionUsed:null,sourceIdsReached:[],...(health?{readinessReason:reason}:{})}}}));
 });
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 server.on('tlsClientError',()=>{});server.headersTimeout=10000;server.requestTimeout=10000;server.setTimeout(10000,socket=>socket.destroy());
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,()=>{server.removeListener('error',reject);resolve();});});
 return {port:(server.address() as {port:number}).port,close:async()=>{const closed=new Promise<void>(resolve=>server.close(()=>resolve()));for(const socket of sockets)socket.destroy();await closed;}};
}
