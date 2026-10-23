import process from 'node:process';
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

export async function gatePreflight({run=runPreflightCommand,probe=probeGateService}={}){
 let running;
 try{running=new Set((await run('docker',['compose','ps','--status','running','--services'],2000)).trim().split(/\s+/u));}
 catch{throw new Error('Test PostgreSQL and Redis: Docker Compose service inspection failed or exceeded 2 seconds. Start Docker Desktop.');}
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
 return {started:missing.map(service=>service.name),postgres:'reachable',redis:'reachable'};
}
