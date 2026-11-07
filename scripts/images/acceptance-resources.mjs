import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout,clearTimeout} from 'node:timers';
import process from 'node:process';
/** External sampler process: synchronous harness jobs must not suppress samples. */
const [directory,daemon,parent]=process.argv.slice(2);if(!directory||!daemon||!parent)throw new Error('Resource capture requires run directory, owned daemon and harness pid.');
const outer={...process.env,DOCKER_HOST:process.env.OPINTEL_CAPTURE_OUTER_HOST??'',DOCKER_CONTEXT:process.env.OPINTEL_CAPTURE_OUTER_CONTEXT??''},nested={...process.env,DOCKER_HOST:'tcp://127.0.0.1:12375',DOCKER_CONTEXT:'',DOCKER_TLS_VERIFY:'',DOCKER_CERT_PATH:''};
let timer,stopped=false;
const call=(args,env)=>{const began=Date.now(),result=spawnSync('docker',args,{env,encoding:'utf8',timeout:4000,maxBuffer:2*1024*1024});return {durationMs:Date.now()-began,status:result.status,errorCode:result.error?.code??null,lines:result.status===0?result.stdout.trim().split('\n').filter(Boolean):[]};};
function sample(){if(stopped)return;try{process.kill(Number(parent),0);}catch{process.exit(0);}
 const at=new Date().toISOString(),host={};for(const [name,command,args] of process.platform==='darwin'?[['load','sysctl',['-n','vm.loadavg']],['memory','vm_stat',[]],['pressure','memory_pressure',['-Q']]]:[['load','cat',['/proc/loadavg']],['memory','cat',['/proc/meminfo']],['pressure','cat',['/proc/pressure/memory']]]){const result=spawnSync(command,args,{encoding:'utf8',timeout:2000,maxBuffer:16384});host[name]={status:result.status,text:result.status===0?result.stdout.trim():null};}
 const nestedCpu={};for(const service of ['engine','api']){const ids=call(['ps','--filter','label=com.docker.compose.service='+service,'--format','{{.ID}}'],nested);for(const id of ids.lines)nestedCpu[service+'-'+id]=call(['exec',id,'sh','-c','for f in /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/cpu/cpu.stat; do if test -r "$f"; then cat "$f"; fi; done'],nested);}
 const stats=Object.fromEntries([['outer',outer],['nested',nested]].map(([scope,env])=>[scope,call(['stats','--no-stream','--format','{{json .}}'],env)]));
 const cgroup=call(['exec',daemon,'sh','-c','for f in /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/cpu/cpu.stat; do if test -r "$f"; then cat "$f"; fi; done'],outer);
 appendFileSync(join(directory,'docker-stats.jsonl'),JSON.stringify({at,finishedAt:new Date().toISOString(),host,stats,nestedCpu,daemonCpuStat:cgroup})+'\n',{mode:0o600});timer=setTimeout(sample,5000);}
process.once('SIGTERM',()=>{stopped=true;clearTimeout(timer);process.exit(0);});sample();
