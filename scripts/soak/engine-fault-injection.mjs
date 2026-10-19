import {readFile,open,appendFile,readdir} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';
import {homedir} from 'node:os';
const exec=promisify(execFile),stamp=new Date().toISOString().replaceAll(':','-');
const report=`tmp/diag/engine-fault-${stamp}.jsonl`,terminal=`tmp/diag/engine-fault-${stamp}-soak.log`;
const emit=async value=>{const line=JSON.stringify({timestamp:new Date().toISOString(),...value});await appendFile(report,line+'\n',{mode:0o600});console.log(line);};
const supervisor=Number((await readFile('tmp/sidecar/sidecar.pid','utf8')).trim());
const before=new Set(await readdir('tmp/soak'));
const out=await open(terminal,'wx',0o600);
const soak=spawn(process.execPath,['--import','tsx','scripts/soak/reinsurance.ts','--target','http://127.0.0.1:3000','--agents','10','--duration','650','--rate','750','--seed','1','--custody','--certs',homedir()+'/.xq/soak-certificates.json','--observer-cookie',homedir()+'/.opintel/observer.cookie'],{stdio:['ignore',out.fd,out.fd]});
await out.close();let ended=false;const closed=new Promise(resolve=>soak.once('exit',(code,signal)=>{ended=true;resolve({code,signal});}));
await emit({kind:'start',supervisor,soakPid:soak.pid,terminal});
let monitorFile,offset=0,pending='',reading=false;
async function observe(){if(reading)return;reading=true;try{
 if(!monitorFile){const file=(await readdir('tmp/soak')).find(f=>!before.has(f));if(!file)return;monitorFile=await open('tmp/soak/'+file,'r');}
 const size=(await monitorFile.stat()).size;if(size<=offset)return;const buffer=Buffer.alloc(size-offset);const {bytesRead}=await monitorFile.read(buffer,0,buffer.length,offset);offset+=bytesRead;pending+=buffer.subarray(0,bytesRead).toString();const lines=pending.split('\n');pending=lines.pop();
 for(const line of lines){const r=JSON.parse(line);if(r.type==='query'||r.type==='custody-result')await appendFile(report,JSON.stringify({timestamp:new Date().toISOString(),kind:'observed_'+r.type,agent:r.agent,sequence:r.sequence,outcome:r.outcome,cause:r.response?._meta?.cause,reason:r.response?._meta?.reason,rows:r.response?.structuredContent?.rows?.length??0,grants:r.response?.structuredContent?.custody?.length??0,custodyQuery:r.sql? /risk_code|broker_reference|recovery_secret/.test(r.sql):undefined,result:r.result})+'\n');}
}finally{reading=false;}}
const monitor=setInterval(()=>{void observe();},500);
const events=async()=>{const lines=(await readFile('tmp/sidecar/service.log','utf8')).split('\n');return lines.flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});};
async function child(){try{const {stdout}=await exec('pgrep',['-P',String(supervisor)]);for(const token of stdout.trim().split(/\s+/)){const pid=Number(token);const {stdout:command}=await exec('ps',['-p',String(pid),'-o','command=']);if(command.includes('/sidecar/start.ts '))return pid;}}catch{}return null;}
async function waitFor(fn,label,timeout=100000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(ended)throw new Error('Soak stopped before '+label);const v=await fn();if(v)return v;await sleep(250);}throw new Error('Timed out: '+label);}
async function ready(excluded){return waitFor(async()=>{const pid=await child();return pid&&pid!==excluded&&(await events()).some(e=>e.event==='engine.child_ready'&&e.pid===pid)?pid:null;},'replacement ready');}
async function kill(pid,phase,index){await emit({kind:'kill',phase,index,pid});process.kill(pid,'SIGKILL');return Date.now();}
try{
 let pid=await ready();await sleep(20000);
 for(let index=1;index<=7;index++){
  const at=await kill(pid,'stable',index);const old=pid;pid=await ready(old);await emit({kind:'ready',phase:'stable',index,pid,recoveryMs:Date.now()-at});
  await waitFor(async()=>(await events()).find(e=>e.event==='engine.restart_budget_reset'&&e.pid===pid),'budget reset');
  await emit({kind:'reset_confirmed',index,pid});await sleep(2000);
 }
 for(let index=1;index<=6;index++){
  const at=await kill(pid,'rapid',index);
  if(index<6){const old=pid;pid=await ready(old);await emit({kind:'ready',phase:'rapid',index,pid,recoveryMs:Date.now()-at});}
 }
 await waitFor(async()=>(await events()).some(e=>e.event==='engine.restart_exhausted'&&Date.parse(e.timestamp)>Date.parse(stamp.replace(/T(\d\d)-(\d\d)-(\d\d)/,'T$1:$2:$3'))),'terminal exhaustion',15000);
 await emit({kind:'terminal_confirmed'});await sleep(15000);
}catch(error){await emit({kind:'failure',message:error.message});process.exitCode=1;}
finally{if(!ended)soak.kill('SIGINT');const outcome=await closed;clearInterval(monitor);while(reading)await sleep(10);await observe();await monitorFile?.close();const files=(await readdir('tmp/soak')).filter(f=>!before.has(f));await emit({kind:'finished',soak:outcome,files});}
