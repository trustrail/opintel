import type {ProjectId} from '../kernel/value-objects.js';
import {constants} from 'node:http2';
import {PassThrough} from 'node:stream';
import type {IncomingHttpHeaders} from 'node:http';
import type {RequestOptions} from 'node:https';
import {randomUUID} from 'node:crypto';
import {isIP,type LookupFunction} from 'node:net';
import {acquireEngineSession,type EngineLease,type ConnectionTrace} from './engine-h2-pool.js';
import {EngineTransportError,type EngineTransportPhase} from './engine-transport-error.js';
import {transportFailureCode} from './transport-failure-code.js';
import {recordEngineTransport} from './engine-transport-metrics.js';
export {EngineTransportError} from './engine-transport-error.js';
export {closeEngineTransports,configureEngineTransport} from './engine-h2-pool.js';
export class EngineResponse extends PassThrough {statusCode=0;headers:IncomingHttpHeaders={};complete=false;}
export type EngineConnectOptions={telemetryProject?:ProjectId;certificatePin?:string;connectTimeoutMs?:number;backoffMs?:number;lookup?:LookupFunction;retryEvent?:'engine.probe_connect_retry'|'engine.connect_retry'};
const delta=(end:string|null|undefined,start:string|null|undefined)=>end&&start?Math.max(0,Date.parse(end)-Date.parse(start)):null;
const retryable=new Set(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','ERR_HTTP2_GOAWAY_SESSION','ERR_HTTP2_INVALID_SESSION']);
/** Pinned TLS precedes HTTP/2 HEADERS. A written request is never replayed. */
export async function engineConnect<T>(url:URL,options:RequestOptions&{signal:AbortSignal},data:string|undefined,consume:(response:EngineResponse)=>Promise<T>,transport:EngineConnectOptions={}):Promise<T>{
 if(url.protocol!=='https:'||url.username||url.password)throw new EngineTransportError('tls',false,false,'pinned_https_required');
 const callId=randomUUID(),path=url.pathname,startedAt=new Date().toISOString(),started=performance.now();let outcome='failure',reused=false,attempts=0;
 const debug=(event:string,fields:Record<string,unknown>)=>{if(process.env.LOG_LEVEL==='debug')console.debug(JSON.stringify({event,timestamp:new Date().toISOString(),callId,path,attempt:attempts,...fields}));};
 try{
  for(let attempt=1;;attempt++){
   attempts=attempt;let lease:EngineLease|undefined,written=false,phase:EngineTransportPhase='connect',trace:ConnectionTrace|undefined;
   const attemptStartedAt=new Date().toISOString(),attemptStarted=performance.now();let requestWrittenAt:string|null=null,responseReceivedAt:string|null=null;
   debug('engine.transport_attempt_started',{dnsSkipped:isIP(url.hostname.replace(/^\[|\]$/gu,''))!==0});
   try{
    lease=await acquireEngineSession({url,options,...transport},options.signal,(event,value)=>{trace=value;phase=value.phase;debug(event,{...value,phase:value.phase==='connect'&&!value.dnsSkipped&&value.addressReturned!==true?'dns':value.phase});});
    trace=lease.trace;reused=lease.reused;phase='response';
    if(options.signal.aborted)throw new EngineTransportError('queue',false,false,'ABORT_ERR');
    const session=lease.session;
    const headers:Record<string,string|string[]|number>={':method':options.method??'POST',':path':url.pathname+url.search,':authority':url.host};
    for(const [name,value] of Object.entries(options.headers??{}))if(value!==undefined&&!['connection','keep-alive','proxy-connection','upgrade','transfer-encoding','host'].includes(name.toLowerCase()))headers[name.toLowerCase()]=value;
    const result=await new Promise<T>((resolve,reject)=>{
     // session.request may throw before HEADERS; once it returns, be conservative.
     let stream:ReturnType<typeof session.request>;try{stream=session.request(headers);}catch(error){const reason=transportFailureCode(error,'request_error');if(['ERR_HTTP2_GOAWAY_SESSION','ERR_HTTP2_INVALID_SESSION'].includes(reason))throw new EngineTransportError('connect',false,false,reason);throw error;}written=true;requestWrittenAt=new Date().toISOString();debug('engine.transport_request_written',{requestWrittenAt,reused,connectionId:trace?.connectionId});
     let settled=false,response:EngineResponse|undefined;
     const finish=(error:unknown,value?:T)=>{if(settled)return;settled=true;if(!stream.readableEnded||!stream.writableFinished){stream.close(constants.NGHTTP2_CANCEL);response?.destroy();}options.signal.removeEventListener('abort',abort);if(error!==undefined)reject(error);else resolve(value as T);};
     const failure=(error:unknown)=>{const failed=error instanceof EngineTransportError?error:new EngineTransportError('response',false,true,transportFailureCode(error,'response_error'));response?.destroy(failed);finish(failed);};
     const abort=()=>{const error=new EngineTransportError('response',false,true,'ABORT_ERR');stream.close(constants.NGHTTP2_CANCEL);response?.destroy(error);finish(error);};
     options.signal.addEventListener('abort',abort,{once:true});
     stream.once('response',incoming=>{
      responseReceivedAt=new Date().toISOString();response=new EngineResponse();response.statusCode=Number(incoming[':status']??0);
      for(const [name,value] of Object.entries(incoming))if(!name.startsWith(':')&&value!==undefined)response.headers[name]=typeof value==='number'?String(value):value;
      response.on('error',()=>{});response.once('close',()=>{if(!stream.readableEnded)stream.close(constants.NGHTTP2_CANCEL);});
      debug('engine.transport_response_received',{responseReceivedAt,status:response.statusCode,reused});
      const body=response;try{void consume(body).then(value=>{outcome=body.statusCode<400?'ok':'http_'+body.statusCode;finish(undefined,value);},error=>{stream.close(constants.NGHTTP2_CANCEL);body.destroy();finish(error);});}catch(error){stream.close(constants.NGHTTP2_CANCEL);body.destroy();finish(error);}stream.pipe(body);
     });
     stream.once('end',()=>{if(response)response.complete=true;});
     stream.once('aborted',()=>{response?.emit('aborted');failure(new EngineTransportError('response',false,true,'response_incomplete'));});
     stream.on('error',failure);
     stream.once('close',()=>{if(!stream.readableEnded&&!settled)failure(new EngineTransportError('response',false,true,'response_incomplete'));});
     if(options.signal.aborted)abort();else stream.end(data);
    });
    debug('engine.transport_attempt_completed',{outcome:'success',written,reused,attemptStartedAt,finishedAt:new Date().toISOString(),requestWrittenAt,responseReceivedAt,...trace,phase:'response',durationsMs:{dns:delta(trace?.dnsCompletedAt,trace?.connectionStartedAt),tcp:delta(trace?.tcpConnectedAt,trace?.dnsCompletedAt??trace?.connectionStartedAt),tls:delta(trace?.tlsCompletedAt,trace?.tcpConnectedAt),connect:delta(trace?.h2ReadyAt,trace?.connectionStartedAt),total:performance.now()-attemptStarted}});
    return result;
   }catch(error){
    if(error instanceof EngineTransportError)phase=error.phase;
    const reason=error instanceof EngineTransportError?error.reason:transportFailureCode(error,'response_error');
    const observed=phase==='connect'&&!isIP(url.hostname.replace(/^\[|\]$/gu,''))&&trace?.addressReturned!==true?'dns':phase;
    debug('engine.transport_failed',{phase:observed,reason,nativeErrorCode:/^[A-Z][A-Z0-9_]+$/u.test(reason)?reason:null,written,aborted:options.signal.aborted,failedAt:new Date().toISOString()});
    debug('engine.transport_attempt_completed',{outcome:'failure',written,reused,attemptStartedAt,finishedAt:new Date().toISOString(),failedAt:new Date().toISOString(),requestWrittenAt,responseReceivedAt,...trace,phase:observed,durationsMs:{dns:delta(trace?.dnsCompletedAt,trace?.connectionStartedAt),tcp:delta(trace?.tcpConnectedAt,trace?.dnsCompletedAt??trace?.connectionStartedAt),tls:delta(trace?.tlsCompletedAt,trace?.tcpConnectedAt),total:performance.now()-attemptStarted}});
    if(!(error instanceof EngineTransportError)||error.phase!=='connect'||error.written||written||attempt>=4||options.signal.aborted||(!error.connectExpired&&!retryable.has(error.reason)))throw error;
    debug(transport.retryEvent??'engine.connect_retry',{attempt:attempt+1,failedAttempt:attempt});
   }finally{lease?.release();}
  }
 }finally{
  const durationMs=performance.now()-started;recordEngineTransport(url.origin,transport.certificatePin??'',path,durationMs,outcome==='failure',transport.telemetryProject);
  console.info(JSON.stringify({event:'engine.transport_call_completed',timestamp:new Date().toISOString(),startedAt,callId,path,outcome,durationMs,reused,attempts}));
 }
}
