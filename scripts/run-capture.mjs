import {setInterval,clearInterval,setTimeout,clearTimeout} from 'node:timers';
import {fork,spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,appendFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const exec=promisify(execFile);
const at=()=>new Date().toISOString();
function append(file,value){appendFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});}
export function recordStats(file,output,startedAt,finishedAt=at()){
 const containers=output.trim()?output.trim().split('\n').map(line=>JSON.parse(line)):[];
 append(file,{startedAt,finishedAt,containers});return containers.length;
}
// Playwright removes its test-results output root before browser tiers.
export function gateRunDirectory(runId,root=process.cwd()){return resolve(root,'tmp','gate-runs',runId);}
/** An independent process keeps observing during spawnSync/CPU-heavy harness work. */
export async function startRunCapture(directory,{env=process.env}={}){
 directory=resolve(directory);mkdirSync(directory,{recursive:true,mode:0o700});
 const fd=openSync(join(directory,'collector-stderr.log'),'a',0o600);
 const child=fork(fileURLToPath(import.meta.url),['--worker',directory],{env,execArgv:[],stdio:['ignore','ignore',fd,'ipc']});closeSync(fd);
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(new Error('Run capture exited before ready: '+code)));child.on('message',m=>{if(m?.ready)resolve();});});
 return {directory,async stop(){if(child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.send({stop:true});});}};
}
async function worker(directory){
 const startedAt=at(),stats=join(directory,'docker-stats.jsonl'),events=join(directory,'docker-events.jsonl'),inventory=join(directory,'containers.jsonl');
 const logs=join(directory,'containers');mkdirSync(logs,{recursive:true,mode:0o700});
 let stopping=false,pending,sequence=0,samples=0,failedSamples=0;const streams=new Map();
 const command=async(args)=>{const r=await exec('docker',args,{timeout:30000,maxBuffer:16*1024*1024});return r.stdout;};
 const capture=(id,name,service)=>{
  if(stopping||streams.has(id)||!(/^(api|engine|postgres|spicedb-postgres|readiness|egress|pairing|console|ingress|redis|spicedb)$/u.test(service??'')||/opintel-first-hour-source-/u.test(name??'')))return;
  const file=join(logs,id+'-'+(++sequence)+'.log'),fd=openSync(file,'a',0o600);
  const child=spawn('docker',['logs','--follow','--timestamps','--since',startedAt,id],{stdio:['ignore',fd,fd]});closeSync(fd);streams.set(id,child);
  append(inventory,{at:at(),id,name,service,log:file});
  child.once('error',()=>{append(inventory,{at:at(),id,captureError:true});streams.delete(id);});
  child.once('exit',(code,signal)=>{append(inventory,{at:at(),id,logExit:code,signal});streams.delete(id);});
 };
 const discover=async()=>{
  const text=await command(['ps','--all','--no-trunc','--format','{{json .}}']);
  for(const line of text.trim().split('\n').filter(Boolean)){
   const c=JSON.parse(line),match=/(?:^|,)com\.docker\.compose\.service=([^,]+)/u.exec(c.Labels??'');if(c.State==='running'||c.Status?.startsWith('Up '))capture(c.ID,c.Names,match?.[1]);
  }
 };
 const sample=async()=>{
  const start=at();try{const output=await command(['stats','--all','--no-stream','--format','{{json .}}']);recordStats(stats,output,start);samples++;await discover();}
  catch(error){failedSamples++;append(stats,{startedAt:start,finishedAt:at(),errorCode:error?.code??null,failed:true});}
 };
 const eventStream=spawn('docker',['events','--since',startedAt,'--filter','type=container','--format','{{json .}}'],{stdio:['ignore','pipe','pipe']});
 let buffer='';eventStream.stdout.on('data',chunk=>{buffer+=String(chunk);for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const e=JSON.parse(line),a=e.Actor?.Attributes??{};append(events,{at:at(),...e});if(['start','create'].includes(e.Action))capture(e.Actor.ID,a.name,a['com.docker.compose.service']);}catch{append(events,{at:at(),parseError:true});}}});
 eventStream.stderr.on('data',()=>{});eventStream.on('error',()=>append(events,{at:at(),streamError:true}));
 try{const info=JSON.parse(await command(['info','--format','{{json .}}']));writeFileSync(join(directory,'docker-capacity.json'),JSON.stringify({at:at(),memoryBytes:info.MemTotal,cpus:info.NCPU,architecture:info.Architecture,serverVersion:info.ServerVersion})+'\n',{mode:0o600});}catch{append(events,{at:at(),capacityError:true});}
 await sample();process.send?.({ready:true});
 const timer=setInterval(()=>{if(stopping||pending)return;pending=sample().finally(()=>{pending=undefined;});},5000);
 const stop=async()=>{
  if(stopping)return;stopping=true;clearInterval(timer);await pending;await sample();eventStream.kill('SIGTERM');
  const children=[eventStream,...streams.values()];
  await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null){resolve();return;}const kill=setTimeout(()=>child.kill('SIGKILL'),5000);child.once('exit',()=>{clearTimeout(kill);resolve();});child.kill('SIGTERM');})));
  writeFileSync(join(directory,'capture.json'),JSON.stringify({startedAt,finishedAt:at(),intervalMs:5000,samples,failedSamples,complete:failedSamples===0})+'\n',{mode:0o600});process.disconnect?.();
 };
 process.on('disconnect',()=>{void stop();});process.on('message',m=>{if(m?.stop)void stop();});process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
}
if(process.argv[2]==='--worker')await worker(resolve(process.argv[3]));
