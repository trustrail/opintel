/** Manual focused checks: node --import tsx --test scripts/soak/observer.test.ts */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createObserver} from './observer.js';
const project='10000000-0000-4000-8000-000000000001',run='10000000-0000-4000-8000-000000000002',pool='10000000-0000-4000-8000-000000000003';
const entry={id:run,projectId:project,poolId:pool,agentId:'soak-1',keyPrefix:'prefix',credentialId:null,mode:'query',startedAt:'2026-10-18T00:00:00.000Z',status:'answered',rowCount:1,latencyMs:1,synthetic:true,request:null,argumentVisibility:'hidden',versions:{policy:1,vocabulary:1,catalog:1,tokenKeyVersionSelected:null}};
const detail={...entry,completedAt:'2026-10-18T00:00:01.000Z',tokenKeyVersionUsed:null,truncated:false,refusalCode:null,generatedSql:null,elements:[],stages:[],sources:[]};
async function cookieFile(){const directory=await mkdtemp(join(tmpdir(),'soak-observer-'));const file=join(directory,'cookie');await writeFile(file,'opintel_session=synthetic-observer',{mode:0o600});return {file,close:()=>rm(directory,{recursive:true,force:true})};}
test('missing cookie skips exactly three stored-receipt checks per query, with a loud warning and no network',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Network forbidden');};
 try{const warnings:string[]=[];const observer=await createObserver(new URL('http://localhost:3000'),project,undefined,m=>warnings.push(m));assert.equal(await observer.read(run,'soak-1'),undefined);assert.equal(await observer.read(run,'soak-1'),undefined);assert.equal(observer.summary().checksSkipped,6);assert.equal(calls,0);assert.match(warnings[0]!,/INVARIANTS DISABLED/);}finally{globalThis.fetch=original;}
});
test('observer can only GET receipt list/detail and never exposes its cookie',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;const paths:string[]=[];let calls=0;
 globalThis.fetch=async(input,init)=>{assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(new Headers(init.headers).get('cookie'),'opintel_session=synthetic-observer');const url=new URL(String(input));paths.push(url.pathname);calls++;return Response.json(url.pathname===`/api/v1/runs/${run}`?detail:{items:calls===1?[]:[entry],nextCursor:null});};
 try{const warnings:string[]=[];const observer=await createObserver(new URL('http://localhost:3000'),project,file.file,m=>warnings.push(m));assert.equal((await observer.read(run,'soak-1'))?.id,run);assert.deepEqual(paths,[`/api/v1/projects/${project}/runs`,`/api/v1/projects/${project}/runs`,`/api/v1/runs/${run}`]);assert.equal(JSON.stringify(observer).includes('synthetic-observer'),false);assert.equal(warnings.length,0);assert.equal(observer.summary().checksSkipped,0);}finally{globalThis.fetch=original;await file.close();}
});
test('401 at startup disables observer, suppresses response body, and never retries or falls back',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('sensitive rejected cookie',{status:401});};
 try{const warnings:string[]=[];const observer=await createObserver(new URL('http://localhost:3000'),project,file.file,m=>warnings.push(m));await observer.read(run,'soak-1');assert.equal(calls,1);assert.equal(observer.summary().checksSkipped,3);assert.match(warnings[0]!,/401/);assert.equal(JSON.stringify(warnings).includes('sensitive'),false);}finally{globalThis.fetch=original;await file.close();}
});
test('revoked observer mid-run counts skipped checks and stops issuing requests',async()=>{
 const file=await cookieFile(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>++calls===1?Response.json({items:[],nextCursor:null}):new Response('',{status:403});
 try{const observer=await createObserver(new URL('http://localhost:3000'),project,file.file,()=>{});await observer.read(run,'soak-1');await observer.read(run,'soak-1');assert.equal(observer.summary().checksSkipped,6);assert.equal(calls,2);}finally{globalThis.fetch=original;await file.close();}
});
