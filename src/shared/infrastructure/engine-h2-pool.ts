import {connect as http2Connect,type ClientHttp2Session} from 'node:http2';
import {connect as tlsConnect,checkServerIdentity,type ConnectionOptions,type TLSSocket} from 'node:tls';
import type {RequestOptions} from 'node:https';
import {isIP,type LookupFunction} from 'node:net';
import {createHash,randomInt,randomUUID} from 'node:crypto';
import {engineTransportDefaults,engineTransportSettingDefinitions,engineTransportSettingsFromEnv,type EngineTransportSettings} from '../engine-transport-settings.js';
import {transportFailureCode} from './transport-failure-code.js';
import {EngineTransportError,type EngineTransportPhase} from './engine-transport-error.js';

export type ConnectionTrace={connectionId:string;connectionStartedAt:string;dnsSkipped:boolean;addressReturned:boolean|null;dnsCompletedAt:string|null;tcpConnectedAt:string|null;tlsCompletedAt:string|null;h2ReadyAt:string|null;phase:EngineTransportPhase};
export type EngineDial={url:URL;options:RequestOptions&Pick<ConnectionOptions,'secureContext'>;certificatePin?:string;lookup?:LookupFunction;connectTimeoutMs?:number;backoffMs?:number};
type Observer=(name:string,trace:ConnectionTrace)=>void;
type Group={key:string;cleanupTimer?:ReturnType<typeof setTimeout>;closed:boolean;entries:Set<Entry>;changed:Set<()=>void>;failures:number;nextConnectAt:number};
type Entry={group:Group;backoffMs:number;state:'connecting'|'ready'|'draining'|'closed';socket?:TLSSocket;session?:ClientHttp2Session;trace:ConnectionTrace;observers:Set<Observer>;waiters:number;active:number;limit:number;ready:Promise<ClientHttp2Session>;resolve:(value:ClientHttp2Session)=>void;reject:(error:unknown)=>void;connectTimer?:ReturnType<typeof setTimeout>;idleTimer?:ReturnType<typeof setTimeout>;ageTimer?:ReturnType<typeof setTimeout>;pingTimer?:ReturnType<typeof setInterval>;outstandingPings:number;missedPings:number};
export type EngineLease={session:ClientHttp2Session;reused:boolean;trace:ConnectionTrace;release:()=>void};
const groups=new Map<string,Group>(),objects=new WeakMap<object,string>();
let settings:EngineTransportSettings={...engineTransportDefaults};
function wake(group:Group){for(const changed of [...group.changed])changed();}
function material(value:unknown):string{
 if(value===undefined||value===null)return String(value);
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return typeof value+':'+String(value);
 if(Buffer.isBuffer(value)||value instanceof Uint8Array)return createHash('sha256').update(value).digest('hex');
 if(Array.isArray(value))return '['+value.map(material).join(',')+']';
 if(typeof value==='object'||typeof value==='function'){let key=objects.get(value);if(!key){key=randomUUID();objects.set(value,key);}return key;}
 return typeof value;
}
function identity(dial:EngineDial){
 const o=dial.options;
 return createHash('sha256').update([dial.url.origin,dial.certificatePin?.replaceAll(':','').toUpperCase()??'',material(o.ca),material(o.cert),material(o.key),material(o.passphrase),material(o.secureContext),material(o.checkServerIdentity),material(o.servername),material(dial.lookup??o.lookup)].join('\0')).digest('hex');
}
function cancelled(phase:EngineTransportPhase){return new EngineTransportError(phase,false,false,'ABORT_ERR');}
function abortable<T>(promise:Promise<T>,signal:AbortSignal,phase:()=>EngineTransportPhase):Promise<T>{
 if(signal.aborted)return Promise.reject(cancelled(phase()));
 return new Promise<T>((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(cancelled(phase()));};signal.addEventListener('abort',abort,{once:true});promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});
}
function pause(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{if(signal.aborted){reject(cancelled('connect'));return;}const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(cancelled('connect'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});
}
function notify(entry:Entry,name:string){for(const observer of entry.observers)observer(name,{...entry.trace});}
function clearTimers(entry:Entry){if(entry.connectTimer)clearTimeout(entry.connectTimer);if(entry.idleTimer)clearTimeout(entry.idleTimer);if(entry.ageTimer)clearTimeout(entry.ageTimer);if(entry.pingTimer)clearInterval(entry.pingTimer);}
function reconnectBackoff(group:Group,base:number){group.failures++;group.nextConnectAt=performance.now()+Math.min(base*2**Math.min(group.failures-1,4),1000)+(base===0?0:randomInt(0,base+1));}
function discard(entry:Entry,error:EngineTransportError){
 if(entry.state==='closed')return;
 if(process.env.LOG_LEVEL==='debug'&&!['session_rotated','session_drained','transport_closed','ABORT_ERR'].includes(error.reason))console.debug(JSON.stringify({event:'engine.transport_session_failed',timestamp:new Date().toISOString(),connectionId:entry.trace.connectionId,phase:error.phase,reason:error.reason}));
 const connecting=entry.state==='connecting';if(!connecting&&!['session_rotated','session_drained','transport_closed','ABORT_ERR'].includes(error.reason))reconnectBackoff(entry.group,entry.backoffMs);entry.state='closed';clearTimers(entry);entry.group.entries.delete(entry);
 if(connecting)entry.reject(error);
 entry.session?.destroy(error);entry.socket?.destroy();wake(entry.group);
 if(!entry.group.closed&&entry.group.entries.size===0&&!entry.group.cleanupTimer){const group=entry.group;group.cleanupTimer=setTimeout(()=>{group.cleanupTimer=undefined;if(group.entries.size===0&&group.changed.size===0){group.closed=true;groups.delete(group.key);}},settings.idleTimeoutMs);group.cleanupTimer.unref();}
}
function retire(entry:Entry){
 if(entry.state==='closed'||entry.state==='draining')return;
 if(entry.state==='connecting'){reconnectBackoff(entry.group,entry.backoffMs);discard(entry,new EngineTransportError('connect',false,false,'h2_goaway_before_ready'));return;}
 entry.state='draining';if(entry.idleTimer)clearTimeout(entry.idleTimer);if(entry.ageTimer)clearTimeout(entry.ageTimer);
 // Already-written streams drain under their caller deadlines, never replay.
 entry.session?.close();if(entry.active===0)discard(entry,new EngineTransportError('connect',false,false,'session_rotated'));else wake(entry.group);
}
function idle(entry:Entry){
 if(entry.idleTimer)clearTimeout(entry.idleTimer);
 if(entry.active||entry.state!=='ready')return;
 entry.session?.unref();entry.idleTimer=setTimeout(()=>retire(entry),settings.idleTimeoutMs);entry.idleTimer.unref();
}
function open(group:Group,dial:EngineDial):Entry{
 let resolve!:(value:ClientHttp2Session)=>void,reject!:(error:unknown)=>void;
 const ready=new Promise<ClientHttp2Session>((yes,no)=>{resolve=yes;reject=no;});
 // Consumers attach immediately; this also handles synchronous TLS failures.
 void ready.catch(()=>{});
 const host=dial.url.hostname.replace(/^\[|\]$/gu,''),entry:Entry={group,backoffMs:dial.backoffMs??50,state:'connecting',trace:{connectionId:randomUUID(),connectionStartedAt:new Date().toISOString(),dnsSkipped:isIP(host)!==0,addressReturned:null,dnsCompletedAt:null,tcpConnectedAt:null,tlsCompletedAt:null,h2ReadyAt:null,phase:'connect'},observers:new Set(),waiters:0,active:0,limit:0,ready,resolve,reject,outstandingPings:0,missedPings:0};
 if(group.cleanupTimer){clearTimeout(group.cleanupTimer);group.cleanupTimer=undefined;}group.entries.add(entry);
 const failed=(error:unknown,expired=false)=>{
  if(entry.state!=='connecting')return;
  const failure=error instanceof EngineTransportError?error:new EngineTransportError(entry.trace.phase,expired,false,transportFailureCode(error,'connect_error'));
  reconnectBackoff(group,entry.backoffMs);discard(entry,failure);
 };
 try{
  const o=dial.options;
  const socket=tlsConnect({host,port:Number(dial.url.port||443),servername:o.servername??(isIP(host)?undefined:host),ca:o.ca,cert:o.cert,key:o.key,passphrase:o.passphrase,secureContext:o.secureContext,minVersion:'TLSv1.3',rejectUnauthorized:true,ALPNProtocols:['h2'],lookup:dial.lookup??o.lookup});entry.socket=socket;
  socket.once('lookup',(_error,address)=>{entry.trace.dnsCompletedAt=new Date().toISOString();entry.trace.addressReturned=Boolean(address);notify(entry,'engine.transport_dns_completed');});
  socket.once('connect',()=>{entry.trace.phase='tls';entry.trace.tcpConnectedAt=new Date().toISOString();notify(entry,'engine.transport_tcp_connected');});
  socket.once('secureConnect',()=>{try{
   if(entry.state!=='connecting')return;
   const certificate=socket.getPeerCertificate(true);
   const policyError=checkServerIdentity(o.servername??host,certificate)??o.checkServerIdentity?.(o.servername??host,certificate);
   if(policyError){failed(new EngineTransportError('tls',false,false,transportFailureCode(policyError,'certificate_validation_failed')));return;}
   if(dial.certificatePin&&certificate.fingerprint256.replaceAll(':','').toUpperCase()!==dial.certificatePin.replaceAll(':','').toUpperCase()){failed(new EngineTransportError('tls',false,false,'ENGINE_PIN_MISMATCH'));return;}
   entry.trace.tlsCompletedAt=new Date().toISOString();notify(entry,'engine.transport_tls_completed');
   if(!socket.authorized||socket.alpnProtocol!=='h2'){failed(new EngineTransportError('tls',false,false,'h2_or_mutual_tls_required'));return;}
   // Never construct a session (or send an HTTP/2 preface) before pin validation.
   const session=http2Connect(dial.url.origin,{createConnection:()=>socket,settings:{enablePush:false}});entry.session=session;
   session.on('error',error=>{if(entry.state==='connecting')failed(error);else discard(entry,new EngineTransportError('response',false,true,transportFailureCode(error,'session_error')));});
   session.once('close',()=>{if(entry.state==='connecting')failed(new EngineTransportError(entry.trace.phase,false,false,'session_closed'));else discard(entry,new EngineTransportError('response',false,true,'session_closed'));});
   session.on('goaway',()=>retire(entry));
   session.on('remoteSettings',remote=>{
    entry.limit=Math.min(settings.maxConcurrentStreams,remote.maxConcurrentStreams??settings.maxConcurrentStreams);
    if(entry.state==='connecting'){
     if(entry.connectTimer)clearTimeout(entry.connectTimer);entry.state='ready';entry.trace.h2ReadyAt=new Date().toISOString();group.failures=0;group.nextConnectAt=0;notify(entry,'engine.transport_h2_ready');entry.resolve(session);
     entry.ageTimer=setTimeout(()=>retire(entry),settings.maxSessionAgeMs);entry.ageTimer.unref();
     entry.pingTimer=setInterval(()=>{
      if(entry.state==='closed')return;
      if(entry.outstandingPings>0)entry.missedPings++;else entry.missedPings=0;
      if(entry.missedPings>=2){discard(entry,new EngineTransportError('connect',true,false,'two_missed_pings'));return;}
      entry.outstandingPings++;try{session.ping(error=>{if(!error){entry.outstandingPings=Math.max(0,entry.outstandingPings-1);entry.missedPings=0;}});}catch{discard(entry,new EngineTransportError('connect',false,false,'ping_failed'));}
     },settings.pingIntervalMs);entry.pingTimer.unref();idle(entry);
    }
    wake(group);
   });
  }catch(error){failed(error);}});
  socket.on('error',error=>failed(error));
  entry.connectTimer=setTimeout(()=>failed(new EngineTransportError(entry.trace.phase,true,false,'connect_deadline'),true),dial.connectTimeoutMs??settings.connectTimeoutMs);entry.connectTimer.unref();
 }catch(error){entry.trace.phase='tls';failed(new EngineTransportError('tls',false,false,transportFailureCode(error,'tls_configuration_error')));}
 return entry;
}
export async function acquireEngineSession(dial:EngineDial,signal:AbortSignal,observer:Observer):Promise<EngineLease>{
 const key=identity(dial);let group=groups.get(key);if(!group){group={key,closed:false,entries:new Set(),changed:new Set(),failures:0,nextConnectAt:0};groups.set(key,group);}
 let reused=true;
 for(;;){
  if(signal.aborted)throw cancelled('queue');if(group.closed)throw new EngineTransportError('connect',false,false,'transport_closed');
  const available=[...group.entries].find(e=>e.state==='ready'&&e.session&&!e.session.closed&&!e.session.destroyed&&e.active<e.limit);
  if(available?.session){
   available.active++;available.session.ref();if(available.idleTimer)clearTimeout(available.idleTimer);let released=false;
   return {session:available.session,reused,trace:{...available.trace},release:()=>{if(released)return;released=true;available.active--;if(available.state==='draining'&&available.active===0)discard(available,new EngineTransportError('connect',false,false,'session_drained'));else idle(available);wake(group);}};
  }
  const pending=[...group.entries].find(e=>e.state==='connecting');
  const occupied=group.entries.size; // Draining sessions still consume the physical session budget.
  if(pending||occupied<settings.maxSessions){
   if(!pending&&group.nextConnectAt>performance.now()){await pause(group.nextConnectAt-performance.now(),signal);continue;}
   // Another caller may have opened a session while this caller backed off.
   const existing=[...group.entries].find(e=>e.state==='connecting');
   const entry=existing??open(group,dial);if(!existing)reused=false;
   entry.waiters++;entry.observers.add(observer);observer('engine.transport_connection_acquired',{...entry.trace});
   try{await abortable(entry.ready,signal,()=>entry.trace.phase);}finally{entry.observers.delete(observer);entry.waiters--;if(entry.waiters===0&&entry.state==='connecting')discard(entry,cancelled(entry.trace.phase));}
   continue;
  }
  let changed!:()=>void;const change=new Promise<void>(resolve=>{changed=resolve;group.changed.add(changed);});
  try{await abortable(change,signal,()=> 'queue');}finally{group.changed.delete(changed);}
 }
}
export function closeEngineTransports():void{for(const group of groups.values()){group.closed=true;if(group.cleanupTimer)clearTimeout(group.cleanupTimer);for(const entry of [...group.entries])discard(entry,new EngineTransportError('connect',false,false,'transport_closed'));wake(group);}groups.clear();}
export function configureEngineTransport(value:EngineTransportSettings):void{
 const env=Object.fromEntries((Object.keys(engineTransportSettingDefinitions) as Array<keyof EngineTransportSettings>).map(key=>[engineTransportSettingDefinitions[key].env,String(value[key])]));
 const parsed=engineTransportSettingsFromEnv(env);if((Object.keys(parsed) as Array<keyof EngineTransportSettings>).every(key=>parsed[key]===settings[key]))return;closeEngineTransports();settings=parsed;
}
