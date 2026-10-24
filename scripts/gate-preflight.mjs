import process from 'node:process';
import console from 'node:console';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,URL} from 'node:url';

const exec=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const services=[{name:'postgres',label:'Test PostgreSQL'},{name:'redis',label:'Redis'}];

export async function runPreflightCommand(command,args,timeout){
 const result=await exec(command,args,{cwd:root,timeout,killSignal:'SIGKILL',maxBuffer:64*1024});
 return result.stdout;
}

export async function probeGateService(service){
 await runPreflightCommand(process.execPath,['--import','tsx',fileURLToPath(new URL('gate-probe.ts',import.meta.url)),service],5000);
}

export function parseAvailableMemory(platform,output){
 let bytes;
 if(platform==='darwin'){
  const pageSize=output.match(/page size of (\d+) bytes/u);
  const pages=['free','inactive','speculative'].map(name=>output.match(new RegExp(`^Pages ${name}:\\s+(\\d+)\\.`, 'mu')));
  if(pageSize&&pages.every(Boolean)&&Number(pageSize[1])>0)bytes=pages.reduce((sum,match)=>sum+Number(match[1]),0)*Number(pageSize[1]);
 }else if(platform==='linux'){
  const available=output.match(/^MemAvailable:\s+(\d+)\s+kB$/mu);
  if(available)bytes=Number(available[1])*1024;
 }
 if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Gate memory preflight: cannot determine available RAM.');
 return bytes;
}

export async function availableMemory({platform=process.platform,run=runPreflightCommand,read=readFile}={}){
 try{
  if(platform==='darwin')return parseAvailableMemory(platform,await run('/usr/bin/vm_stat',[],5000));
  if(platform==='linux')return parseAvailableMemory(platform,await read('/proc/meminfo','utf8'));
 }catch{throw new Error('Gate memory preflight: cannot determine available RAM.');}
 throw new Error('Gate memory preflight: available RAM measurement supports macOS and Linux only.');
}

export async function gatePreflight({run=runPreflightCommand,probe=probeGateService,memory=availableMemory}={}){
 const minimumAvailableBytes=1024**3,availableBytes=await memory();
 if(!Number.isFinite(availableBytes)||availableBytes<0)throw new Error('Gate memory preflight: cannot determine available RAM.');
 if(availableBytes<minimumAvailableBytes)throw new Error(`Gate memory preflight: ${(availableBytes/1024**3).toFixed(2)} GiB available RAM; at least 1 GiB required. Free host memory before starting the gate.`);
 console.info(`Gate memory preflight: ${(availableBytes/1024**3).toFixed(2)} GiB available RAM; minimum 1 GiB.`);
 let running;
 try{running=new Set((await run('docker',['compose','ps','--status','running','--services'],5000)).trim().split(/\s+/u));}
 catch{throw new Error('Test PostgreSQL and Redis: Docker Compose service inspection failed or exceeded 5 seconds. Start Docker Desktop.');}
 const missing=services.filter(service=>!running.has(service.name));
 let startupFailed=false;
 if(missing.length){
  try{await run('docker',['compose','up','-d','--no-deps','--no-recreate','--pull','never',...missing.map(service=>service.name)],5000);}
  catch{startupFailed=true;}
 }
 // Independent workers enforce a hard deadline even if a driver handshake hangs.
 const results=await Promise.allSettled(services.map(service=>probe(service.name)));
 const failures=services.filter((_,index)=>results[index].status==='rejected');
 if(failures.length)throw new Error(failures.map(service=>`${service.label} did not become reachable within 5 seconds${startupFailed?' after Compose startup failed or timed out':''}. Check docker compose logs ${service.name} and its configured test endpoint.`).join('\n'));
 return {memory:{availableBytes,minimumAvailableBytes},started:missing.map(service=>service.name),postgres:'reachable',redis:'reachable'};
}
