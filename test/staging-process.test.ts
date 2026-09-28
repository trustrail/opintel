import {spawn} from 'node:child_process';
import {request as http} from 'node:https';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
import {prepareSidecarDevelopment} from '../scripts/sidecar-dev.js';
import {loadSidecarConfig} from '../sidecar/config.js';
import {executionRequest} from '../src/shared/execution-contract.js';
it('J-022/J-023 sidecar death during a staged execution sends no partial response and subsequent connections fail closed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'staging-process-'));await prepareSidecarDevelopment(directory);
 const {tls}=await loadSidecarConfig(join(directory,'service.json'));
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./fixtures/staging-process.ts',import.meta.url)),join(directory,'service.json')],{stdio:['ignore','pipe','pipe','ipc']});
 let output='';child.stdout.on('data',(b:Buffer)=>{output+=b.toString();});child.stderr.on('data',(b:Buffer)=>{output+=b.toString();});
 const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
 let executing!:()=>void;const started=new Promise<void>(resolve=>{executing=resolve;});
 const ready=new Promise<number>((resolve,reject)=>{child.on('message',m=>{if(m==='executing')executing();else if(m&&typeof m==='object'&&'port' in m&&typeof m.port==='number')resolve(m.port);});child.once('error',reject);child.once('exit',()=>reject(new Error('Fixture exited before ready.')));});
 try{
  const port=await ready,sourceId=randomUUID(),elementId=randomUUID();
  const r=executionRequest.parse({requestId:'death-test',projectId:randomUUID(),poolId:randomUUID(),policyVersion:1,sql:'SELECT label,sum(a.range*b.range) FROM orders,range(10000000) a,range(10000000) b GROUP BY label',namespace:{catalog:'memory',schema:'main'},sources:[{sourceId,credentialRef:'secret://test/source'}],entitlements:[{elementId,treatment:'clear'}],objects:[{catalog:'memory',schema:'main',name:'orders',sourceId,readPlan:{catalog:'memory',schema:'public',object:'orders',columns:[{elementId,sourceIdentifier:'label',exposedName:'label',exposedType:'VARCHAR',treatment:'clear',readAs:'native'}]}}],aggregateMinGroupSize:5,limits:{memoryMb:64,threads:1,timeoutMs:30000,rowLimit:10,concurrency:1},entitlementContext:null});
  const key=await readFile(join(directory,'tls/client.key'),'utf8');let bytes=0;
  const call=()=>new Promise<'failed'|'ended'>(resolve=>{const req=http(`https://127.0.0.1:${port}/execute`,{method:'POST',ca:tls.ca,cert:tls.clientPin,key,agent:false,headers:{'content-type':'application/json'}},res=>{res.on('data',(b:Buffer)=>{bytes+=b.length;});res.on('end',()=>resolve('ended'));res.on('error',()=>resolve('failed'));});req.on('error',()=>resolve('failed'));req.end(JSON.stringify(r));});
  const pending=call();await Promise.race([started,pending.then(()=>{throw new Error('Query ended before the attack boundary.');})]);child.kill('SIGKILL');await exited;
  expect(await pending).toBe('failed');expect(bytes).toBe(0);expect(await call()).toBe('failed');expect(output).not.toContain('ROW_VALUE_SENTINEL');
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;await rm(directory,{recursive:true,force:true});}
},30000);
