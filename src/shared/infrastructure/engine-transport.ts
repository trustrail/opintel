import {transportFailureCode} from './transport-failure-code.js';
import {request,type RequestOptions} from 'node:https';
import type {IncomingMessage} from 'node:http';
import {isIP,type LookupFunction} from 'node:net';
import {randomUUID} from 'node:crypto';

type Phase='connect'|'tls'|'response';
type ObservedPhase='dns'|Phase;
export class EngineTransportError extends Error {
 constructor(readonly phase:Phase,readonly connectExpired:boolean,readonly written:boolean,readonly reason:string='transport_error'){super('Engine '+phase+' transport failed: '+reason+'.');}
}
export type EngineConnectOptions={connectTimeoutMs?:number;lookup?:LookupFunction;retryEvent?:'engine.probe_connect_retry'|'engine.connect_retry'};
/** The caller owns the single operation deadline. Only a pre-TCP timeout can
 * retry. No HTTP headers or body are written before pinned TLS succeeds. */
export async function engineConnect<T>(url:URL,options:RequestOptions&{signal:AbortSignal},data:string|undefined,consume:(response:IncomingMessage)=>Promise<T>,transport:EngineConnectOptions={}):Promise<T>{
 const callId=randomUUID(),path=url.pathname;
 for(let attempt=1;;attempt++){
  try{return await new Promise<T>((resolve,reject)=>{
   let phase:Phase='connect',written=false,settled=false,connectExpired=false,timer:ReturnType<typeof setTimeout>|undefined;
   const started=performance.now(),dnsSkipped=isIP(url.hostname.replace(/^\[|\]$/gu,''))!==0;
   const times:{attemptStartedAt:string;dnsCompletedAt:string|null;tcpConnectedAt:string|null;tlsCompletedAt:string|null;requestWrittenAt:string|null;failedAt:string|null;finishedAt:string|null}={attemptStartedAt:new Date().toISOString(),dnsCompletedAt:null,tcpConnectedAt:null,tlsCompletedAt:null,requestWrittenAt:null,failedAt:null,finishedAt:null};
   let dnsMs:number|null=dnsSkipped?0:null,tcpAt:number|null=null,tlsAt:number|null=null,writeAt:number|null=null,addressReturned:boolean|null=null,nativeErrorCode:string|null=null;
   const observedPhase=():ObservedPhase=>phase==='connect'&&!dnsSkipped&&addressReturned!==true?'dns':phase;
   const native=(error:unknown)=>{const code=transportFailureCode(error,'');return code||null;};
   const event=(name:string,extra:Record<string,unknown>={})=>console.info({event:name,timestamp:new Date().toISOString(),callId,path,attempt,phase:observedPhase(),nativeErrorCode,...extra});
   event('engine.transport_attempt_started',{dnsSkipped});
   const finish=(error:unknown,value?:T)=>{
    if(settled)return;settled=true;if(timer)clearTimeout(timer);
    const elapsed=performance.now()-started;times.finishedAt=new Date().toISOString();
    if(error!==undefined){nativeErrorCode??=native(error);times.failedAt=times.finishedAt;event('engine.transport_failed',{reason:error instanceof EngineTransportError?error.reason:transportFailureCode(error,phase+'_error'),written,aborted:options.signal?.aborted===true});}
    event('engine.transport_attempt_completed',{outcome:error===undefined?'success':'failure',written,dnsSkipped,addressReturned,...times,durationsMs:{dns:dnsMs,tcp:tcpAt===null||(!dnsSkipped&&dnsMs===null)?null:tcpAt-(dnsMs??0),tls:tlsAt===null||tcpAt===null?null:tlsAt-tcpAt,requestWrite:writeAt===null||tlsAt===null?null:writeAt-tlsAt,connect:tcpAt,total:elapsed}});
    if(error!==undefined)reject(error);else resolve(value as T);
   };
   let req:ReturnType<typeof request>;try{req=request(url,{...options,agent:false,...(transport.lookup?{lookup:transport.lookup}:{})},res=>{phase='response';void consume(res).then(value=>finish(undefined,value),error=>finish(error));});}catch(error){nativeErrorCode=native(error);phase='tls';finish(new EngineTransportError('tls',false,false,transportFailureCode(error,'tls_configuration_error')));return;}
   req.on('error',error=>{nativeErrorCode=native(error);finish(new EngineTransportError(phase,connectExpired,written,transportFailureCode(error,phase+'_error')));});
   req.once('socket',socket=>{
    // Observe the socket; do not wrap or replace the configured/default lookup.
    socket.once('lookup',(error:Error|null,address:string|undefined)=>{times.dnsCompletedAt=new Date().toISOString();dnsMs=performance.now()-started;addressReturned=Boolean(address);event('engine.transport_dns_completed',{addressReturned,nativeErrorCode:native(error),dnsCompletedAt:times.dnsCompletedAt});});
    socket.once('connect',()=>{phase='tls';if(timer)clearTimeout(timer);tcpAt=performance.now()-started;times.tcpConnectedAt=new Date().toISOString();event('engine.transport_tcp_connected',{tcpConnectedAt:times.tcpConnectedAt});});
    socket.once('secureConnect',()=>{if(settled||req.destroyed||options.signal?.aborted)return;tlsAt=performance.now()-started;times.tlsCompletedAt=new Date().toISOString();event('engine.transport_tls_completed',{tlsCompletedAt:times.tlsCompletedAt});phase='response';written=true;req.end(data);writeAt=performance.now()-started;times.requestWrittenAt=new Date().toISOString();event('engine.transport_request_written',{requestWrittenAt:times.requestWrittenAt});});
   });
   if(attempt<4){timer=setTimeout(()=>{if(phase!=='connect'||settled)return;connectExpired=true;req.destroy(new Error('Engine connect deadline'));},transport.connectTimeoutMs??1000);timer.unref();}
  });}catch(error){
   if(!(error instanceof EngineTransportError)||!error.connectExpired||error.phase!=='connect'||error.written||attempt>=4||options.signal?.aborted)throw error;
   console.info({event:transport.retryEvent??'engine.connect_retry',timestamp:new Date().toISOString(),callId,path,attempt:attempt+1,failedAttempt:attempt});
  }
 }
}
