import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInternalH2Server as createServer} from '../src/shared/infrastructure/internal-h2-server.js';
import {connect as tlsConnect,type TLSSocket} from 'node:tls';
import {EventEmitter} from 'node:events';
vi.mock('node:tls',async importOriginal=>{const original=await importOriginal<typeof import('node:tls')>();return {...original,connect:vi.fn(original.connect)};});
import {createServer as tcpServer,type LookupFunction} from 'node:net';
import {checkServerIdentity} from 'node:tls';
import type {EngineResponse} from '../src/shared/infrastructure/engine-transport.js';
import {engineConnect,closeEngineTransports,configureEngineTransport} from '../src/shared/infrastructure/engine-transport.js';
import {acquireEngineSession} from '../src/shared/infrastructure/engine-h2-pool.js';
import {engineTransportDefaults} from '../src/shared/engine-transport-settings.js';
import {prepareSidecarDevelopment} from '../scripts/sidecar-dev.js';
import {loadSidecarConfig} from '../sidecar/config.js';
import {developmentEngineOptions} from '../scripts/development-engine.js';
let directory:string,tls:Awaited<ReturnType<typeof loadSidecarConfig>>['tls'],options:Awaited<ReturnType<typeof developmentEngineOptions>>;
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'engine-connect-'));await prepareSidecarDevelopment(directory);tls=(await loadSidecarConfig(join(directory,'service.json'))).tls;options=await developmentEngineOptions(join(directory,'service.json'));},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
afterEach(()=>{closeEngineTransports();configureEngineTransport(engineTransportDefaults);vi.restoreAllMocks();vi.mocked(tlsConnect).mockReset();vi.unstubAllEnvs();});
const consume=async(res:EngineResponse)=>{let text='';for await(const chunk of res)text+=String(chunk);return {status:res.statusCode,text};};
const requestOptions=(signal:AbortSignal,pin=options.tls.certificatePin)=>({method:'POST',signal,...options.tls,minVersion:'TLSv1.3' as const,rejectUnauthorized:true,checkServerIdentity:(host:string,cert:Parameters<typeof checkServerIdentity>[1])=>checkServerIdentity(host,cert)??(cert.fingerprint256.replaceAll(':','')===pin?undefined:new Error('Wrong pin'))});
const lookup:LookupFunction=(_host,o,callback)=>callback(null,o.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4);

it.each(['/execute','/health','/custody/rotate','/introspect'])('CONNECT-01: %s survives three pre-connect stalls and sends exactly once after pinned TLS',async path=>{
 let requests=0,lookups=0,body='';const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},async(req,res)=>{requests++;for await(const chunk of req)body+=String(chunk);res.end('accepted');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{const result=await engineConnect(new URL(`https://localhost:${address.port}${path}`),requestOptions(AbortSignal.timeout(2000)),'mutation-once',consume,{backoffMs:0,connectTimeoutMs:250,lookup:(host,o,callback)=>{if(++lookups<4)return;lookup(host,o,callback);}});expect(result.text).toBe('accepted');expect(lookups).toBe(4);expect(requests).toBe(1);expect(body).toBe('mutation-once');}
 finally{closeEngineTransports();await new Promise<void>(r=>server.close(()=>r()));}
});

it.each(['reset','stream-reset','http','stall'] as const)('CONNECT-02: no execution retry after request write on %s',async mode=>{
 let requests=0,lookups=0;const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},async(req,res)=>{if(req.url==='/warmup'){res.end('ready');return;}requests++;for await(const _chunk of req){/* drain mutation */}if(mode==='reset'){if('stream' in req)req.stream.session?.destroy();else req.socket.destroy();}else if(mode==='stream-reset')res.destroy();else if(mode==='http'){res.writeHead(503);res.end('refused');}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(3000)),countLookup:LookupFunction=(...args)=>{lookups++;lookup(...args);};
 try{
  // Complete pinned H2 setup before starting the post-write cancellation clock.
  await engineConnect(new URL(`https://localhost:${address.port}/warmup`),common,undefined,consume,{lookup:countLookup});
  const call=engineConnect(new URL(`https://localhost:${address.port}/execute`),{...common,signal:AbortSignal.timeout(300)},'mutation-once',consume,{backoffMs:0,connectTimeoutMs:50,lookup:countLookup});
  if(mode==='http')expect((await call).status).toBe(503);else await expect(call).rejects.toBeDefined();expect(requests).toBe(1);expect(lookups).toBe(1);
 }finally{closeEngineTransports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('CONNECT-03: wrong pin writes nothing and never retries',async()=>{
 let requests=0,lookups=0;const server=createServer(tls,(_req,res)=>{requests++;res.end();});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{await expect(engineConnect(new URL(`https://localhost:${address.port}/execute`),requestOptions(AbortSignal.timeout(500),'00'.repeat(32)),'secret',consume,{backoffMs:0,connectTimeoutMs:50,lookup:(...args)=>{lookups++;lookup(...args);}})).rejects.toMatchObject({phase:'tls',written:false});expect(requests).toBe(0);expect(lookups).toBe(1);}
 finally{closeEngineTransports();await new Promise<void>(r=>server.close(()=>r()));}
});

it('CONNECT-04: TLS stall never retries; persistent TCP stalls keep the original deadline; cancellation stops recovery',async()=>{
 let connects=0;const sockets=new Set<import('node:net').Socket>();const server=tcpServer(socket=>{connects++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{await expect(engineConnect(new URL(`https://localhost:${address.port}/execute`),requestOptions(AbortSignal.timeout(200)),'secret',consume,{backoffMs:0,connectTimeoutMs:20,lookup})).rejects.toMatchObject({phase:'tls',written:false});expect(connects).toBe(1);}
 finally{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}
 let lookups=0;const started=performance.now();await expect(engineConnect(new URL('https://localhost:1/execute'),requestOptions(AbortSignal.timeout(250)),'secret',consume,{backoffMs:0,connectTimeoutMs:20,lookup:()=>{lookups++;}})).rejects.toMatchObject({phase:'connect',written:false});expect(lookups).toBe(4);expect(performance.now()-started).toBeLessThan(1000);
 const controller=new AbortController();lookups=0;await expect(engineConnect(new URL('https://localhost:1/execute'),requestOptions(controller.signal),'secret',consume,{backoffMs:0,connectTimeoutMs:20,lookup:()=>{lookups++;controller.abort();}})).rejects.toBeDefined();expect(lookups).toBe(1);
});

it('CONNECT-05: invalid TLS material refuses before writing and retains a bounded native error code',async()=>{
 await expect(engineConnect(new URL('https://localhost:1/health'),{...requestOptions(AbortSignal.timeout(500)),key:'invalid synthetic key'},undefined,consume)).rejects.toMatchObject({phase:'tls',written:false,reason:'ERR_OSSL_UNSUPPORTED'});
});


it('CONNECT-06: stalled DNS is recorded separately without changing connect-only recovery',async()=>{
 vi.stubEnv('LOG_LEVEL','debug');const log=vi.spyOn(console,'debug').mockImplementation(()=>{});
 await expect(engineConnect(new URL('https://private-host.invalid:1/health'),requestOptions(AbortSignal.timeout(150)),'private-body',consume,{backoffMs:0,connectTimeoutMs:20,lookup:()=>{}})).rejects.toMatchObject({phase:'connect',written:false});
 const events=log.mock.calls.map(([event])=>JSON.parse(String(event)) as Record<string,unknown>),failures=events.filter(event=>event.event==='engine.transport_failed'),summaries=events.filter(event=>event.event==='engine.transport_attempt_completed');
 expect(failures).toHaveLength(4);expect(failures.every(event=>event.phase==='dns'&&event.path==='/health'&&!event.written)).toBe(true);
 expect(new Set(events.filter(event=>event.callId).map(event=>event.callId)).size).toBe(1);expect(summaries.map(event=>event.attempt)).toEqual([1,2,3,4]);
 expect(summaries.every(event=>event.dnsCompletedAt===null&&event.tcpConnectedAt===null&&event.failedAt&&event.attemptStartedAt)).toBe(true);
 expect(JSON.stringify(events)).not.toMatch(/private-host|private-body|certificate|127\.0\.0\.1/u);
});
it('CONNECT-07: a resolved address with stalled TCP is recorded as connect',async()=>{
 vi.stubEnv('LOG_LEVEL','debug');const log=vi.spyOn(console,'debug').mockImplementation(()=>{});
 vi.mocked(tlsConnect).mockImplementation(()=>{
  const socket=new EventEmitter() as EventEmitter&{destroy:()=>void};socket.destroy=()=>{};
  queueMicrotask(()=>socket.emit('lookup',null,'192.0.2.123',4,'private-host.invalid'));
  return socket as TLSSocket;
 });
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),150);
 try{await expect(engineConnect(new URL('https://private-host.invalid/execute'),requestOptions(abort.signal),'private-body',consume,{backoffMs:0,connectTimeoutMs:20})).rejects.toMatchObject({phase:'connect',written:false});}
 finally{clearTimeout(timer);}
 const events=log.mock.calls.map(([event])=>JSON.parse(String(event)) as Record<string,unknown>),failures=events.filter(event=>event.event==='engine.transport_failed');
 expect(failures).toHaveLength(4);expect(failures.every(event=>event.phase==='connect'&&!event.written)).toBe(true);
 expect(events.filter(event=>event.event==='engine.transport_dns_completed').every(event=>event.addressReturned===true)).toBe(true);
 expect(events.filter(event=>event.event==='engine.transport_attempt_completed').every(event=>event.dnsCompletedAt&&event.tcpConnectedAt===null)).toBe(true);
 expect(JSON.stringify(events)).not.toMatch(/192\.0\.2|private-host|private-body/u);
});

it('H2-01: multiplexes calls on one authenticated session and isolates cancellation',async()=>{
 let sessions=0,requests=0;
 const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(req,res)=>{requests++;if(req.url==='/execute')res.end('accepted');});
 server.on('session',()=>sessions++);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address();if(!address||typeof address==='string')throw new Error();
 const controller=new AbortController(),common=requestOptions(AbortSignal.timeout(3000)),base=`https://localhost:${address.port}`;
 try{
  expect((await engineConnect(new URL(base+'/execute'),common,undefined,consume)).text).toBe('accepted');
  const stalled=engineConnect(new URL(base+'/health'),{...common,signal:controller.signal},undefined,consume);
  const refused=expect(stalled).rejects.toMatchObject({written:true,reason:'ABORT_ERR'});
  const answers=await Promise.all(Array.from({length:8},()=>engineConnect(new URL(base+'/execute'),common,undefined,consume)));
  expect(answers.every(answer=>answer.text==='accepted')).toBe(true);controller.abort();await refused;
  expect((await engineConnect(new URL(base+'/execute'),common,undefined,consume)).text).toBe('accepted');
  expect(sessions).toBe(1);expect(requests).toBe(11);
 }finally{closeEngineTransports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('H2-02: extra sessions open only at exhausted capacity; queued calls observe the peer limit',async()=>{
 configureEngineTransport({...engineTransportDefaults,maxSessions:2,maxConcurrentStreams:4});vi.stubEnv('ENGINE_TRANSPORT_MAX_CONCURRENT_STREAMS','1');
 let sessions=0,received=0,active=0,maximum=0;const waiting:Array<()=>void>=[];
 const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(req,res)=>{
  req.resume();if(req.url==='/warmup'){res.end('ready');return;}
  received++;active++;maximum=Math.max(maximum,active);waiting.push(()=>{active--;res.end('accepted');});
 });
 server.on('session',()=>{sessions++;});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(5000)),base=`https://localhost:${address.port}`;
 try{
  await engineConnect(new URL(base+'/warmup'),common,undefined,consume);expect(sessions).toBe(1);
  const calls=Array.from({length:3},()=>engineConnect(new URL(base+'/execute'),common,undefined,consume));
  for(const call of calls)void call.catch(()=>{});
  await vi.waitFor(()=>expect(received).toBe(2));expect(sessions).toBe(2);expect(maximum).toBe(2);
  waiting.shift()!();await vi.waitFor(()=>expect(received).toBe(3));expect(sessions).toBe(2);for(const finish of waiting.splice(0))finish();
  expect((await Promise.all(calls)).every(answer=>answer.text==='accepted')).toBe(true);expect(maximum).toBe(2);
 }finally{closeEngineTransports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it.each(['idle','age'] as const)('H2-03: %s expiry rotates and re-pins the session',async reason=>{
 configureEngineTransport({...engineTransportDefaults,...reason==='idle'?{idleTimeoutMs:1000}:{maxSessionAgeMs:1000}});
 let sessions=0;const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(_req,res)=>res.end('accepted'));
 server.on('session',()=>sessions++);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(5000)),url=new URL(`https://localhost:${address.port}/execute`);
 try{
  await engineConnect(url,common,undefined,consume);expect(sessions).toBe(1);await new Promise(r=>setTimeout(r,1100));
  expect((await engineConnect(url,common,undefined,consume)).text).toBe('accepted');expect(sessions).toBe(2);
 }finally{closeEngineTransports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('H2-04: two missed pings discard the session and the next call reconnects',async()=>{
 configureEngineTransport({...engineTransportDefaults,pingIntervalMs:1000});let sessions=0,requests=0;
 const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(req,res)=>{req.resume();requests++;res.end('accepted');});
 server.on('session',()=>sessions++);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(6000)),url=new URL(`https://localhost:${address.port}/execute`);
 try{
  const lease=await acquireEngineSession({url,options:common},common.signal,()=>{}),ping=vi.spyOn(lease.session,'ping').mockImplementation(()=>true);lease.release();
  await vi.waitFor(()=>expect(lease.session.destroyed).toBe(true),{timeout:4000});expect(ping).toHaveBeenCalledTimes(2);
  expect((await engineConnect(url,common,undefined,consume)).text).toBe('accepted');expect(sessions).toBe(2);expect(requests).toBe(1);
 }finally{closeEngineTransports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('H2-05: a changed pin cannot reuse an authenticated session',async()=>{
 let requests=0;const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(req,res)=>{req.resume();requests++;res.end('accepted');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(3000)),url=new URL(`https://localhost:${address.port}/execute`);
 try{
  await engineConnect(url,common,undefined,consume,{certificatePin:options.tls.certificatePin});
  const original=await acquireEngineSession({url,options:common,certificatePin:options.tls.certificatePin},common.signal,()=>{});original.release();
  await expect(engineConnect(url,common,undefined,consume,{certificatePin:'00'.repeat(32)})).rejects.toMatchObject({phase:'tls',written:false,reason:'ENGINE_PIN_MISMATCH'});
  expect(requests).toBe(1);expect((await engineConnect(url,common,undefined,consume,{certificatePin:options.tls.certificatePin})).text).toBe('accepted');const reused=await acquireEngineSession({url,options:common,certificatePin:options.tls.certificatePin},common.signal,()=>{});expect(reused.session).toBe(original.session);reused.release();expect(requests).toBe(2);
 }finally{closeEngineTransports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('H2-06: GOAWAY drains an answered stream and reconnects without replay',async()=>{
 let sessions=0,requests=0;const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(req,res)=>{
  req.resume();requests++;if(requests===1&&'stream' in req)req.stream.session?.goaway();res.end('accepted');
 });
 server.on('session',()=>sessions++);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(3000)),url=new URL(`https://localhost:${address.port}/execute`);
 try{
  expect((await engineConnect(url,common,'mutation-once',consume)).text).toBe('accepted');
  expect((await engineConnect(url,common,'second-mutation',consume)).text).toBe('accepted');expect(sessions).toBe(2);expect(requests).toBe(2);
 }finally{closeEngineTransports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('H2-07: active age rotation drains without exceeding the one-session budget or replaying',async()=>{
 configureEngineTransport({...engineTransportDefaults,maxSessionAgeMs:1000});let sessions=0,requests=0,finishFirst:()=>void=()=>{};
 const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(req,res)=>{req.resume();requests++;if(requests===1)finishFirst=()=>res.end('first');else res.end('second');});
 server.on('session',()=>sessions++);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(5000)),url=new URL(`https://localhost:${address.port}/execute`),calls:Array<Promise<Awaited<ReturnType<typeof consume>>>>=[];
 try{
  calls.push(engineConnect(url,common,'mutation-once',consume));void calls[0]!.catch(()=>{});await vi.waitFor(()=>expect(requests).toBe(1));await new Promise(r=>setTimeout(r,1100));
  calls.push(engineConnect(url,common,'next-mutation',consume));void calls[1]!.catch(()=>{});await new Promise(r=>setTimeout(r,50));expect(sessions).toBe(1);expect(requests).toBe(1);
  finishFirst();expect((await calls[0]!).text).toBe('first');expect((await calls[1]!).text).toBe('second');expect(sessions).toBe(2);expect(requests).toBe(2);
 }finally{closeEngineTransports();await Promise.allSettled(calls);server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

it('H2-08: cancelling one setup waiter does not cancel a connection still needed by another caller',async()=>{
 let requests=0,lookups=0,releaseLookup:(()=>void)|undefined;
 const server=createServer({...tls,requestCert:true,rejectUnauthorized:true},(req,res)=>{req.resume();requests++;res.end('accepted');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();
 const common=requestOptions(AbortSignal.timeout(3000)),url=new URL(`https://localhost:${address.port}/execute`),controller=new AbortController();
 const deferred:LookupFunction=(...args)=>{lookups++;releaseLookup=()=>lookup(...args);};
 let second:Promise<Awaited<ReturnType<typeof consume>>>|undefined;
 try{
  const first=engineConnect(url,{...common,signal:controller.signal},undefined,consume,{lookup:deferred}),refused=expect(first).rejects.toMatchObject({written:false,reason:'ABORT_ERR'});
  await vi.waitFor(()=>expect(releaseLookup).toBeTypeOf('function'));
  second=engineConnect(url,common,undefined,consume,{lookup:deferred});void second.catch(()=>{});
  controller.abort();await refused;releaseLookup!();expect((await second).text).toBe('accepted');expect(lookups).toBe(1);expect(requests).toBe(1);
 }finally{controller.abort();closeEngineTransports();if(second)await Promise.allSettled([second]);server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
