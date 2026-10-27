import {transportFailureCode} from './transport-failure-code.js';
import {request,type RequestOptions} from 'node:https';
import type {IncomingMessage} from 'node:http';
import type {LookupFunction} from 'node:net';

type Phase='connect'|'tls'|'response';
export class EngineTransportError extends Error {
 constructor(readonly phase:Phase,readonly connectExpired:boolean,readonly written:boolean,readonly reason:string='transport_error'){super('Engine '+phase+' transport failed: '+reason+'.');}
}
export type EngineConnectOptions={connectTimeoutMs?:number;lookup?:LookupFunction;retryEvent?:'engine.probe_connect_retry'|'engine.connect_retry'};
/** The caller owns the single operation deadline. Only a pre-TCP timeout can
 * retry. No HTTP headers or body are written before pinned TLS succeeds. */
export async function engineConnect<T>(url:URL,options:RequestOptions&{signal:AbortSignal},data:string|undefined,consume:(response:IncomingMessage)=>Promise<T>,transport:EngineConnectOptions={}):Promise<T>{
 for(let attempt=1;;attempt++){
  try{return await new Promise<T>((resolve,reject)=>{
   let phase:Phase='connect',written=false,settled=false,connectExpired=false,timer:ReturnType<typeof setTimeout>|undefined;
   const finish=(error:unknown,value?:T)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);if(error!==undefined)reject(error);else resolve(value as T);};
   let req:ReturnType<typeof request>;try{req=request(url,{...options,agent:false,...(transport.lookup?{lookup:transport.lookup}:{})},res=>{phase='response';void consume(res).then(value=>finish(undefined,value),error=>finish(error));});}catch(error){finish(new EngineTransportError('tls',false,false,transportFailureCode(error,'tls_configuration_error')));return;}
   req.on('error',error=>finish(new EngineTransportError(phase,connectExpired,written,transportFailureCode(error,phase+'_error'))));
   req.once('socket',socket=>{
    socket.once('connect',()=>{phase='tls';if(timer)clearTimeout(timer);});
    socket.once('secureConnect',()=>{if(settled||req.destroyed||options.signal?.aborted)return;phase='response';written=true;req.end(data);});
   });
   if(attempt<4){timer=setTimeout(()=>{if(phase!=='connect'||settled)return;connectExpired=true;req.destroy(new Error('Engine connect deadline'));},transport.connectTimeoutMs??1000);timer.unref();}
  });}catch(error){
   if(!(error instanceof EngineTransportError)||!error.connectExpired||error.phase!=='connect'||error.written||attempt>=4||options.signal?.aborted){
    if(error instanceof EngineTransportError)console.info({event:'engine.transport_failed',timestamp:new Date().toISOString(),phase:error.phase,reason:error.reason,written:error.written,aborted:options.signal?.aborted===true,attempt});
    throw error;
   }
   // No address, request body, credentials or arbitrary error text in telemetry.
   console.info({event:transport.retryEvent??'engine.connect_retry',timestamp:new Date().toISOString(),attempt:attempt+1});
  }
 }
}
