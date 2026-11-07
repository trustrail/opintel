import {execFile} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout,clearTimeout} from 'node:timers';
import {promisify} from 'node:util';
import process from 'node:process';
/** External sampler process: synchronous harness jobs must not suppress samples. */
const [directory,daemon,parent]=process.argv.slice(2);if(!directory||!daemon||!parent)throw new Error('Resource capture requires run directory, owned daemon and harness pid.');
const outer={...process.env,DOCKER_HOST:process.env.OPINTEL_CAPTURE_OUTER_HOST??'',DOCKER_CONTEXT:process.env.OPINTEL_CAPTURE_OUTER_CONTEXT??''},nested={...process.env,DOCKER_HOST:'tcp://127.0.0.1:12375',DOCKER_CONTEXT:'',DOCKER_TLS_VERIFY:'',DOCKER_CERT_PATH:''};
let timer,stopped=false;const execute=promisify(execFile);
const call=async(command,args,env)=>{const began=Date.now();try{const result=await execute(command,args,{env,encoding:'utf8',timeout:4000,maxBuffer:2*1024*1024});return {durationMs:Date.now()-began,status:0,lines:result.stdout.trim().split('\n').filter(Boolean)};}catch(error){return {durationMs:Date.now()-began,status:typeof error.code==='number'?error.code:null,errorCode:typeof error.code==='string'?error.code:null,lines:[]};}};
const cpu=['sh','-c','for f in /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/cpu/cpu.stat; do if test -r "$f"; then cat "$f"; fi; done'];
async function sample(){if(stopped)return;try{process.kill(Number(parent),0);}catch{process.exit(0);}
 const began=Date.now(),at=new Date().toISOString();
 const hostCommands=process.platform==='darwin'?[['load','sysctl',['-n','vm.loadavg']],['memory','vm_stat',[]],['pressure','memory_pressure',['-Q']]]:[['load','cat',['/proc/loadavg']],['memory','cat',['/proc/meminfo']],['pressure','cat',['/proc/pressure/memory']]];
 const [host,stats,nestedCpu,cgroup]=await Promise.all([
  Promise.all(hostCommands.map(async([name,command,args])=>[name,await call(command,args,outer)])).then(Object.fromEntries),
  Promise.all([['outer',outer],['nested',nested]].map(async([scope,env])=>[scope,await call('docker',['stats','--no-stream','--format','{{json .}}'],env)])).then(Object.fromEntries),
  Promise.all(['engine','api'].map(async service=>{const ids=await call('docker',['ps','--filter','label=com.docker.compose.service='+service,'--format','{{.ID}}'],nested);return Promise.all(ids.lines.map(async id=>[service+'-'+id,await call('docker',['exec',id,...cpu],nested)]));})).then(values=>Object.fromEntries(values.flat())),
  call('docker',['exec',daemon,...cpu],outer),
 ]);
 appendFileSync(join(directory,'docker-stats.jsonl'),JSON.stringify({at,finishedAt:new Date().toISOString(),host,stats,nestedCpu,daemonCpuStat:cgroup})+'\n',{mode:0o600});timer=setTimeout(sample,Math.max(0,5000-(Date.now()-began)));}
process.once('SIGTERM',()=>{stopped=true;clearTimeout(timer);process.exit(0);});void sample();
