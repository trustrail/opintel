import console from 'node:console';
import process from 'node:process';
import {performance} from 'node:perf_hooks';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout,clearTimeout} from 'node:timers';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {gatePreflight} from './gate-preflight.mjs';
import {gateDatabase} from './gate-database.mjs';
import {gateMemoryMonitor} from './gate-memory.mjs';
import {randomUUID} from 'node:crypto';
import {cleanupGateContainers} from './gate-containers.mjs';
async function isolation(tier){
 const checks=[];
 for(const port of [3000,3100,3101,4173,5173]){
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
  checks.push({port,available:true});
 }
 mkdirSync('test-results',{recursive:true});
 writeFileSync(`test-results/isolation-${tier}.json`,JSON.stringify({at:new Date().toISOString(),checks},null,2)+'\n');
}

const commit=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const runId=randomUUID();process.env.OPINTEL_GATE_RUN_ID=runId;
const start=performance.now(),tiers=[];
let preflight,database,cleanup,interrupted,child,killTimer;
const memory=gateMemoryMonitor();
function stop(signal){
 interrupted=signal;
 if(child?.pid){
  const pid=child.pid;
  try{process.kill(-pid,signal);}catch{/* Child already exited. */}
  killTimer=setTimeout(()=>{try{process.kill(-pid,'SIGKILL');}catch{/* Child already exited. */}},5000);
 }
}
const interrupt=()=>stop('SIGINT'),terminate=()=>stop('SIGTERM');
process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
function record(){
 mkdirSync('test-results',{recursive:true});
 writeFileSync('test-results/gate.json',JSON.stringify({commit,runId,preflight,memory:memory.snapshot(),tiers,cleanup,interrupted,wallSeconds:(performance.now()-start)/1000,complete:tiers.length===7&&tiers.every(tier=>tier.exitCode===0)&&cleanup?.exitCode===0&&!interrupted},null,2)+'\n');
}
async function tier(script){
 return new Promise(resolve=>{
  child=spawn('npm',['run',script],{stdio:'inherit',detached:true});
  child.once('error',()=>resolve(1));
  child.once('exit',code=>{clearTimeout(killTimer);child=undefined;resolve(code??1);});
 });
}
try{
 await memory.start(record);
 const services=await gatePreflight({memory:()=>memory.snapshot().startAvailableBytes});
 database=gateDatabase();
 await database.prepare();
 process.env.TEST_DATABASE_URL=database.url;
 preflight={...services,database:database.name,migratedFromZero:true,seconds:(performance.now()-start)/1000,exitCode:0};
 console.log(`Gate preflight: PostgreSQL and Redis reachable; fresh migrated database ${database.name}.`);
 record();
 // Sequential; never retry a tier or run domains concurrently with smoke setup.
 const scripts=['typecheck','typecheck:conformance','lint','build:production','test:conformance','test','test:smoke'];
 for(const script of scripts){
  if(interrupted)break;
  if(script==='test:conformance'||script==='test:smoke')await isolation(script.replace(':','-'));
  if(interrupted)break;
  const began=performance.now(),exitCode=await tier(script);
  tiers.push({tier:script,seconds:(performance.now()-began)/1000,exitCode});
  record();
  if(exitCode!==0){process.exitCode=exitCode;break;}
 }
}catch(error){
 const message=error instanceof Error?error.message:'Gate setup failed.';
 if(!preflight)preflight={database:database?.name,seconds:(performance.now()-start)/1000,exitCode:1,message};
 console.error(`Gate failed: ${message}`);
 process.exitCode=1;
}finally{
 try{await database?.close();cleanup={database:database?.name,exitCode:0};}
 catch(error){cleanup={database:database?.name,exitCode:1,message:error.message};console.error(error.message);process.exitCode=1;}
 try{const owned=tiers.length?await cleanupGateContainers(runId):{removed:0};cleanup.containersRemoved=owned.removed;}
 catch{cleanup.exitCode=1;cleanup.containerCleanup='failed';console.error('Gate-owned container cleanup failed; preserve the run-labelled fixtures for inspection.');process.exitCode=1;}
 await memory.stop();
 clearTimeout(killTimer);
 process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);
 if(interrupted)process.exitCode=interrupted==='SIGINT'?130:143;
 record();
}
console.log(`Gate wall time: ${((performance.now()-start)/1000).toFixed(2)}s`);
