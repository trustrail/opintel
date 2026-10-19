/** Manual focused checks: node --import tsx --test scripts/soak/observer.test.ts */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createObserver,ObserverFailure} from './observer.js';
const project='10000000-0000-4000-8000-000000000001',run='10000000-0000-4000-8000-000000000002',pool='10000000-0000-4000-8000-000000000003';
const entry={id:run,projectId:project,poolId:pool,agentId:'soak-1',keyPrefix:'prefix',credentialId:null,mode:'query',startedAt:'2026-10-18T00:00:00.000Z',status:'answered',rowCount:1,latencyMs:1,synthetic:true,request:null,argumentVisibility:'hidden',versions:{policy:1,vocabulary:1,catalog:1,tokenKeyVersionSelected:null}};
const detail={...entry,completedAt:'2026-10-18T00:00:01.000Z',tokenKeyVersionUsed:null,truncated:false,refusalCode:null,generatedSql:null,elements:[],stages:[],sources:[]};
async function cookieFile(){const directory=await mkdtemp(join(tmpdir(),'soak-observer-'));const file=join(directory,'cookie');await writeFile(file,'opintel_session=synthetic-observer',{mode:0o600});return {directory,file,close:()=>rm(directory,{recursive:true,force:true})};}
test('missing cookie fails preflight before any query; never skips into a passing run',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Network forbidden');};
 const warnings:string[]=[];const observer=createObserver(new URL('http://localhost:3000'),project,undefined,m=>warnings.push(m));
 try{await assert.rejects(observer.ready(),ObserverFailure);assert.equal(observer.summary().failed,true);assert.equal(observer.summary().checksSkipped,0);assert.equal(calls,0);assert.match(warnings[0]!,/SOAK FAILED/);}finally{await observer.close();globalThis.fetch=original;}
});
test('observer can only GET receipt list/detail and never exposes its cookie',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;const paths:string[]=[];let calls=0;
 globalThis.fetch=async(input,init)=>{assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(new Headers(init.headers).get('cookie'),'opintel_session=synthetic-observer');const url=new URL(String(input));paths.push(url.pathname);calls++;return Response.json(url.pathname===`/api/v1/runs/${run}`?detail:{items:calls===1?[]:[entry],nextCursor:null});};
 const warnings:string[]=[];const observer=createObserver(new URL('http://localhost:3000'),project,file.file,m=>warnings.push(m));
 try{await observer.ready();assert.equal((await observer.read(run,'soak-1'))?.id,run);assert.deepEqual(paths,[`/api/v1/projects/${project}/runs`,`/api/v1/projects/${project}/runs`,`/api/v1/runs/${run}`]);assert.equal(JSON.stringify(observer).includes('synthetic-observer'),false);assert.equal(warnings.length,0);assert.deepEqual(observer.summary(),{enabled:true,failed:false,reason:null,checksSkipped:0});}finally{await observer.close();globalThis.fetch=original;await file.close();}
});
for(const status of [301,400,401,403,429,500])test(`receipt API HTTP ${status} fails preflight loudly without exposing its body or retrying`,async()=>{
 const file=await cookieFile(),original=globalThis.fetch;let calls=0,stops=0;globalThis.fetch=async()=>{calls++;return new Response('sensitive rejected cookie',{status});};
 const warnings:string[]=[];const observer=createObserver(new URL('http://localhost:3000'),project,file.file,m=>warnings.push(m),()=>{stops++;});
 try{await assert.rejects(observer.ready(),new RegExp(String(status)));assert.equal(calls,1);assert.equal(stops,1);assert.equal(observer.summary().failed,true);assert.match(warnings[0]!,/SOAK FAILED/);assert.equal(JSON.stringify(warnings).includes('sensitive'),false);}finally{await observer.close();globalThis.fetch=original;await file.close();}
});
test('revoked observer mid-run stops all agents, counts unperformed checks and never retries',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;let calls=0,stops=0;globalThis.fetch=async()=>++calls===1?Response.json({items:[],nextCursor:null}):new Response('',{status:403});
 const observer=createObserver(new URL('http://localhost:3000'),project,file.file,()=>{},()=>{stops++;});
 try{await observer.ready();await assert.rejects(observer.read(run,'soak-1'),/403/);await assert.rejects(observer.read(run,'soak-2'),/403/);assert.equal(observer.summary().checksSkipped,6);assert.equal(observer.summary().failed,true);assert.equal(calls,2);assert.equal(stops,1);}finally{await observer.close();globalThis.fetch=original;await file.close();}
});
for(const status of [401,500])test(`receipt detail HTTP ${status} stops verification and cannot yield a successful receipt`,async()=>{
 const file=await cookieFile(),original=globalThis.fetch;let calls=0,stops=0;
 globalThis.fetch=async()=>++calls===1?Response.json({items:[],nextCursor:null}):calls===2?Response.json({items:[entry],nextCursor:null}):new Response('sensitive-detail-body',{status});
 const observer=createObserver(new URL('http://localhost:3000'),project,file.file,()=>{},()=>{stops++;});
 try{await observer.ready();await assert.rejects(observer.read(run,'soak-1'),new RegExp(String(status)));assert.equal(observer.summary().checksSkipped,3);assert.equal(observer.summary().failed,true);assert.equal(stops,1);assert.equal(calls,3);assert.equal(JSON.stringify(observer.summary()).includes('sensitive-detail-body'),false);}finally{await observer.close();globalThis.fetch=original;await file.close();}
});
test('network exceptions are fatal and cannot expose a cookie carried in the original error',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('opintel_session=synthetic-observer');};const warnings:string[]=[];const observer=createObserver(new URL('http://localhost:3000'),project,file.file,m=>warnings.push(m));
 try{await assert.rejects(observer.ready(),/network/);assert.equal(observer.summary().failed,true);assert.equal(JSON.stringify(warnings).includes('synthetic-observer'),false);}finally{await observer.close();globalThis.fetch=original;await file.close();}
});
test('a fresh cookie file is reread before the next receipt request without any auth write endpoint',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;const cookies:string[]=[];
 globalThis.fetch=async(input,init)=>{cookies.push(new Headers(init?.headers).get('cookie')!);return Response.json(String(input).includes(`/runs/${run}?`)?detail:{items:[entry],nextCursor:null});};
 const observer=createObserver(new URL('http://localhost:3000'),project,file.file,()=>{});
 try{await observer.ready();await writeFile(file.file,'opintel_session=fresh-synthetic-session');await observer.read(run,'soak-1');assert.deepEqual(cookies,['opintel_session=synthetic-observer','opintel_session=fresh-synthetic-session','opintel_session=fresh-synthetic-session']);assert.equal(observer.summary().failed,false);}finally{await observer.close();globalThis.fetch=original;await file.close();}
});
for(const response of [()=>new Response('not JSON'),()=>Response.json({wrong:'schema'})])test('invalid receipt response fails closed',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;globalThis.fetch=async()=>response();const observer=createObserver(new URL('http://localhost:3000'),project,file.file,()=>{});
 try{await assert.rejects(observer.ready(),ObserverFailure);assert.equal(observer.summary().failed,true);}finally{await observer.close();globalThis.fetch=original;await file.close();}
});
test('receipt-only heartbeat keeps idle sessions active and an expired-session 401 stops the run',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const file=await cookieFile(),original=globalThis.fetch;let calls=0,stops=0;
 globalThis.fetch=async input=>{assert.equal(new URL(String(input)).pathname,`/api/v1/projects/${project}/runs`);return ++calls<3?Response.json({items:[],nextCursor:null}):new Response('',{status:401});};
 const observer=createObserver(new URL('http://localhost:3000'),project,file.file,()=>{},()=>{stops++;});
 try{await observer.ready();t.mock.timers.tick(30000);while(calls<2)await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));assert.equal(observer.summary().failed,false);
  t.mock.timers.tick(30000);while(!stops)await new Promise(resolve=>setImmediate(resolve));await assert.rejects(observer.read(run,'soak-1'),/401/);assert.equal(calls,3);
 }finally{await observer.close();globalThis.fetch=original;await file.close();t.mock.timers.reset();}
 assert.equal(stops,1);
});
test('the external harness exits 1 with FAILED and receipt status first, before issuing any agent query on startup 401',async()=>{
 const file=await cookieFile();let calls=0;const server=createServer((_request,response)=>{calls++;response.writeHead(401);response.end('must not leak');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 const manifest=join(file.directory,'manifest.json');await writeFile(manifest,JSON.stringify({version:2,projectId:project,definitionHash:'synthetic',agents:Array.from({length:10},(_,i)=>({poolIndex:i%2,pool,credentialId:randomUUID(),key:'synthetic-pool-key'})),objects:{},specification:{version:2,objects:[],scenarios:[],literals:[]}}),{mode:0o600});
 try{const result=await new Promise<{code:number|null;out:string;err:string}>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','scripts/soak/reinsurance.ts','--target',`http://127.0.0.1:${address.port}`,'--manifest',manifest,'--observer-cookie',file.file,'--duration','1'],{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>{out+=String(b);});child.stderr.on('data',b=>{err+=String(b);});child.once('error',reject);child.once('close',code=>resolve({code,out,err}));});
  assert.equal(result.code,1);assert.equal(calls,1);const summary=JSON.parse(result.out) as {status:string;receiptInvariants:{failed:boolean};agents:object};assert.equal(summary.status,'FAILED');assert.equal(summary.receiptInvariants.failed,true);assert.deepEqual(summary.agents,{});assert.match(result.err,/SOAK FAILED/);assert.equal((result.out+result.err).includes('must not leak'),false);assert.equal((result.out+result.err).includes('synthetic-observer'),false);assert.deepEqual(Object.keys(summary).slice(0,3),['type','status','receiptInvariants']);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await file.close();}
});
