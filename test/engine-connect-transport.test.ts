import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,request as httpsRequest} from 'node:https';
import {EventEmitter} from 'node:events';
import type {ClientRequest,RequestOptions} from 'node:http';
vi.mock('node:https',async importOriginal=>{const original=await importOriginal<typeof import('node:https')>();return {...original,request:vi.fn(original.request)};});
import {createServer as tcpServer,type LookupFunction} from 'node:net';
import {checkServerIdentity} from 'node:tls';
import type {IncomingMessage} from 'node:http';
import {engineConnect} from '../src/shared/infrastructure/engine-transport.js';
import {prepareSidecarDevelopment} from '../scripts/sidecar-dev.js';
import {loadSidecarConfig} from '../sidecar/config.js';
import {developmentEngineOptions} from '../scripts/development-engine.js';
let directory:string,tls:Awaited<ReturnType<typeof loadSidecarConfig>>['tls'],options:Awaited<ReturnType<typeof developmentEngineOptions>>;
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'engine-connect-'));await prepareSidecarDevelopment(directory);tls=(await loadSidecarConfig(join(directory,'service.json'))).tls;options=await developmentEngineOptions(join(directory,'service.json'));},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
afterEach(()=>{vi.restoreAllMocks();vi.mocked(httpsRequest).mockReset();});
const consume=async(res:IncomingMessage)=>{let text='';for await(const chunk of res)text+=String(chunk);return {status:res.statusCode,text};};
const requestOptions=(signal:AbortSignal,pin=options.tls.certificatePin)=>({method:'POST',signal,...options.tls,minVersion:'TLSv1.3' as const,rejectUnauthorized:true,checkServerIdentity:(host:string,cert:Parameters<typeof checkServerIdentity>[1])=>checkServerIdentity(host,cert)??(cert.fingerprint256.replaceAll(':','')===pin?undefined:new Error('Wrong pin'))});
const lookup:LookupFunction=(_host,o,callback)=>callback(null,o.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4);

it.each(['/execute','/health','/custody/rotate','/introspect'])('CONNECT-01: %s survives three pre-connect stalls and sends exactly once after pinned TLS',async path=>{
 let requests=0,lookups=0,body='';const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},async(req,res)=>{requests++;for await(const chunk of req)body+=String(chunk);res.end('accepted');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{const result=await engineConnect(new URL(`https://localhost:${address.port}${path}`),requestOptions(AbortSignal.timeout(2000)),'mutation-once',consume,{connectTimeoutMs:25,lookup:(host,o,callback)=>{if(++lookups<4)return;lookup(host,o,callback);}});expect(result.text).toBe('accepted');expect(lookups).toBe(4);expect(requests).toBe(1);expect(body).toBe('mutation-once');}
 finally{await new Promise<void>(r=>server.close(()=>r()));}
});

it.each(['reset','http','stall'] as const)('CONNECT-02: no execution retry after request write on %s',async mode=>{
 let requests=0,lookups=0;const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},async(req,res)=>{requests++;for await(const _chunk of req){/* drain mutation */}if(mode==='reset')res.destroy();else if(mode==='http'){res.writeHead(503);res.end('refused');}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{const call=engineConnect(new URL(`https://localhost:${address.port}/execute`),requestOptions(AbortSignal.timeout(300)),'mutation-once',consume,{connectTimeoutMs:50,lookup:(...args)=>{lookups++;lookup(...args);}});if(mode==='http')expect((await call).status).toBe(503);else await expect(call).rejects.toBeDefined();expect(requests).toBe(1);expect(lookups).toBe(1);}
 finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('CONNECT-03: wrong pin writes nothing and never retries',async()=>{
 let requests=0,lookups=0;const server=createServer(tls,(_req,res)=>{requests++;res.end();});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{await expect(engineConnect(new URL(`https://localhost:${address.port}/execute`),requestOptions(AbortSignal.timeout(500),'00'.repeat(32)),'secret',consume,{connectTimeoutMs:50,lookup:(...args)=>{lookups++;lookup(...args);}})).rejects.toMatchObject({phase:'tls',written:false});expect(requests).toBe(0);expect(lookups).toBe(1);}
 finally{await new Promise<void>(r=>server.close(()=>r()));}
});

it('CONNECT-04: TLS stall never retries; persistent TCP stalls keep the original deadline; cancellation stops recovery',async()=>{
 let connects=0;const sockets=new Set<import('node:net').Socket>();const server=tcpServer(socket=>{connects++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{await expect(engineConnect(new URL(`https://localhost:${address.port}/execute`),requestOptions(AbortSignal.timeout(200)),'secret',consume,{connectTimeoutMs:20,lookup})).rejects.toMatchObject({phase:'tls',written:false});expect(connects).toBe(1);}
 finally{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}
 let lookups=0;const started=performance.now();await expect(engineConnect(new URL('https://localhost:1/execute'),requestOptions(AbortSignal.timeout(250)),'secret',consume,{connectTimeoutMs:20,lookup:()=>{lookups++;}})).rejects.toMatchObject({phase:'connect',written:false});expect(lookups).toBe(4);expect(performance.now()-started).toBeLessThan(1000);
 const controller=new AbortController();lookups=0;await expect(engineConnect(new URL('https://localhost:1/execute'),requestOptions(controller.signal),'secret',consume,{connectTimeoutMs:20,lookup:()=>{lookups++;controller.abort();}})).rejects.toBeDefined();expect(lookups).toBe(1);
});

it('CONNECT-05: invalid TLS material refuses before writing and retains a bounded native error code',async()=>{
 await expect(engineConnect(new URL('https://localhost:1/health'),{...requestOptions(AbortSignal.timeout(500)),key:'invalid synthetic key'},undefined,consume)).rejects.toMatchObject({phase:'tls',written:false,reason:'ERR_OSSL_UNSUPPORTED'});
});


it('CONNECT-06: stalled DNS is recorded separately without changing connect-only recovery',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 await expect(engineConnect(new URL('https://private-host.invalid:1/health'),requestOptions(AbortSignal.timeout(150)),'private-body',consume,{connectTimeoutMs:20,lookup:()=>{}})).rejects.toMatchObject({phase:'connect',written:false});
 const events=log.mock.calls.map(([event])=>event),failures=events.filter(event=>event.event==='engine.transport_failed'),summaries=events.filter(event=>event.event==='engine.transport_attempt_completed');
 expect(failures).toHaveLength(4);expect(failures.every(event=>event.phase==='dns'&&event.path==='/health'&&!event.written)).toBe(true);
 expect(new Set(events.map(event=>event.callId)).size).toBe(1);expect(summaries.map(event=>event.attempt)).toEqual([1,2,3,4]);
 expect(summaries.every(event=>event.dnsCompletedAt===null&&event.tcpConnectedAt===null&&event.failedAt&&event.attemptStartedAt)).toBe(true);
 expect(JSON.stringify(events)).not.toMatch(/private-host|private-body|certificate|127\.0\.0\.1/u);
});
it('CONNECT-07: a resolved address with stalled TCP is recorded as connect',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 vi.mocked(httpsRequest).mockImplementation((...args)=>{
  const signal=(args[1] as RequestOptions).signal;
  const req=new EventEmitter() as EventEmitter&{destroyed:boolean;destroy:(error:Error)=>void;end:()=>void};req.destroyed=false;req.end=()=>{throw new Error('TCP stall must not write');};req.destroy=error=>{signal?.removeEventListener('abort',aborted);req.destroyed=true;queueMicrotask(()=>req.emit('error',error));};
  const aborted=()=>req.destroy(Object.assign(new Error('aborted'),{code:'ABORT_ERR'}));signal?.addEventListener('abort',aborted,{once:true});
  queueMicrotask(()=>{const socket=new EventEmitter();req.emit('socket',socket);socket.emit('lookup',null,'192.0.2.123',4,'private-host.invalid');});
  return req as unknown as ClientRequest;
 });
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),150);
 try{await expect(engineConnect(new URL('https://private-host.invalid/execute'),requestOptions(abort.signal),'private-body',consume,{connectTimeoutMs:20})).rejects.toMatchObject({phase:'connect',written:false});}
 finally{clearTimeout(timer);}
 const events=log.mock.calls.map(([event])=>event),failures=events.filter(event=>event.event==='engine.transport_failed');
 expect(failures).toHaveLength(4);expect(failures.every(event=>event.phase==='connect'&&!event.written)).toBe(true);
 expect(events.filter(event=>event.event==='engine.transport_dns_completed').every(event=>event.addressReturned===true)).toBe(true);
 expect(events.filter(event=>event.event==='engine.transport_attempt_completed').every(event=>event.dnsCompletedAt&&event.tcpConnectedAt===null)).toBe(true);
 expect(JSON.stringify(events)).not.toMatch(/192\.0\.2|private-host|private-body/u);
});
