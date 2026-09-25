import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as tcpServer } from 'node:net';
import { createServer as httpsServer } from 'node:https';
import { mkdtemp, readFile, writeFile, mkdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { prepareSidecarDevelopment, startDevelopmentSidecar, checkLocalSidecar } from '../scripts/sidecar-dev.js';
import { stopRecordedSidecar, portAvailable } from '../scripts/sidecar-process.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { Client } from 'pg';

const entryPoint=fileURLToPath(new URL('../sidecar/start.ts',import.meta.url));
let directory:string;
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'sidecar-process-'));await prepareSidecarDevelopment(directory);},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
async function availablePort(){const server=tcpServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;}
function launch(file:string,env:NodeJS.ProcessEnv=process.env){
 const child=spawn(process.execPath,['--import','tsx',entryPoint,file],{env,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString();});child.stderr.on('data',(chunk:Buffer)=>{output+=chunk.toString();});
 const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 return {child,exited,output:()=>output};
}
function forceCleanup(child:ChildProcess){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}

it('bounds real SIGTERM shutdown while a watcher is waiting on a receipt',async()=>{
 const {config,tls}=await loadSidecarConfig(join(directory,'service.json'));
 const sockets=new Set<import('node:net').Socket>();
 let pending=false;
 const receiver=httpsServer({ca:tls.ca,cert:tls.clientPin,key:await readFile(join(directory,'tls/client.key'),'utf8'),requestCert:true,rejectUnauthorized:true},req=>{req.resume();pending=true;});
 receiver.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await new Promise<void>(resolve=>receiver.listen(0,'127.0.0.1',resolve));
 const address=receiver.address();if(!address||typeof address==='string')throw new Error('No port');
 const zone=join(directory,'zone');await mkdir(zone);const rules=join(directory,'rules.json');await writeFile(rules,JSON.stringify({filingParties:[],rules:[]}));
 const sourceId=randomUUID();const stateFile=join(directory,'register.json');const file=join(directory,'watcher.json');
 await writeFile(file,JSON.stringify({...config,port:0,shutdownTimeoutMs:300,auditFile:join(directory,'watcher-audit.jsonl'),receiptUrl:`https://127.0.0.1:${address.port}`,landingZones:[{directory:zone,stateFile,rulesFile:rules,projectId:randomUUID(),sourceId,pollMs:10,landing:{name:'shutdown_'+sourceId.replaceAll('-',''),credentialRef:'secret://test/shutdown',strategy:'append_as_at'}}]}));
 const process=launch(file,{...globalThis.process.env,OPINTEL_SECRET_TEST_SHUTDOWN:globalThis.process.env.TEST_DATABASE_URL});
 try{
  await vi.waitFor(()=>expect(process.output()).toContain('Sidecar ready.'),{timeout:10000});
  await vi.waitFor(()=>expect(pending).toBe(true));
  process.child.kill('SIGTERM');
  // The receipt's own timeout is nine seconds: the process-wide deadline must
  // cover it and report failure, rather than silently leaving a stale process.
  await vi.waitFor(()=>expect(process.child.exitCode !== null || process.child.signalCode !== null).toBe(true),{timeout:2000});
  await expect(process.exited).resolves.toEqual({code:1,signal:null});
  expect(process.output()).toContain('shutdown deadline exceeded');
  expect(JSON.parse(await readFile(stateFile,'utf8'))).toMatchObject({version:2,sourceId,filings:[]});
 }finally{
  forceCleanup(process.child);await process.exited;for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>receiver.close(()=>resolve()));
  const db=new Client({connectionString:globalThis.process.env.TEST_DATABASE_URL});await db.connect();
  try{const rows=await db.query<{schema_name:string}>('DELETE FROM _opintel_landing.sources WHERE source_id=$1 RETURNING schema_name',[sourceId]);for(const row of rows.rows)await db.query(`DROP SCHEMA "${row.schema_name.replaceAll('"','""')}" CASCADE`);}finally{await db.end();}
 }
},15000);

it('dev:up replaces the recorded sidecar only after it exits and its port is free',async()=>{
 const file=join(directory,'service.json');const original=JSON.parse(await readFile(file,'utf8')) as Record<string,unknown>;const port=await availablePort();
 await writeFile(file,JSON.stringify({...original,port,shutdownTimeoutMs:500}));
 const clientFile=join(directory,'client.json');const client=JSON.parse(await readFile(clientFile,'utf8')) as Record<string,unknown>;
 await writeFile(clientFile,JSON.stringify({...client,baseUrl:`https://127.0.0.1:${port}`}));
 const pidFile=join(directory,'sidecar.pid');const stop={pidFile,entryPoint,host:'127.0.0.1',port,timeoutMs:2500};
 try{
  await startDevelopmentSidecar(directory);const first=Number(await readFile(pidFile,'utf8'));
  await startDevelopmentSidecar(directory);const second=Number(await readFile(pidFile,'utf8'));
  expect(second).not.toBe(first);expect(()=>globalThis.process.kill(first,0)).toThrow();await checkLocalSidecar(clientFile);
 }finally{await stopRecordedSidecar(stop);}
 expect(await portAvailable('127.0.0.1',port)).toBe(true);
},15000);

it('refuses an unresponsive recorded PID and an unrecorded port owner without starting a replacement',async()=>{
 const file=join(directory,'service.json');const {config}=await loadSidecarConfig(file);const port=await availablePort();
 await writeFile(file,JSON.stringify({...config,port,shutdownTimeoutMs:100,auditFile:join(directory,'stale-audit.jsonl')}));
 const running=launch(file);const pidFile=join(directory,'sidecar.pid');
 try{
  await vi.waitFor(()=>expect(running.output()).toContain('Sidecar ready.'),{timeout:10000});
  await writeFile(pidFile,String(running.child.pid));running.child.kill('SIGSTOP');
  await expect(startDevelopmentSidecar(directory)).rejects.toThrow(`recorded PID ${running.child.pid}`);
  expect(await readFile(pidFile,'utf8')).toBe(String(running.child.pid));expect(await portAvailable('127.0.0.1',port)).toBe(false);
 }finally{forceCleanup(running.child);await running.exited;}
 await unlink(pidFile);
 const other=tcpServer();await new Promise<void>(resolve=>other.listen(port,'127.0.0.1',resolve));
 try{await expect(startDevelopmentSidecar(directory)).rejects.toThrow('No replacement was started');await expect(readFile(pidFile,'utf8')).rejects.toMatchObject({code:'ENOENT'});}
 finally{await new Promise<void>(resolve=>other.close(()=>resolve()));}
},15000);
