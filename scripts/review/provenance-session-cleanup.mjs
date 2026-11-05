import {execFileSync} from 'node:child_process';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {setTimeout as delay} from 'node:timers/promises';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/u,'');
const databaseFilter="(datname='opintel_test' OR datname ~ '^opintel_test_gate_[a-z0-9_]+$')";
function sql(query){return execFileSync('docker',['compose','exec','-T','postgres','sh','-c','exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "$1"','psql',query],{cwd:root,encoding:'utf8'});}
function nodes(){
 const rows=execFileSync('ps',['-Ao','pid=,ppid=,lstart=,etime=,args='],{encoding:'utf8'}).split('\n');
 const found=[];
 for(const row of rows){
  const m=/^\s*(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(\S+)\s+(.+)$/u.exec(row);if(!m)continue;
  const [,pid,ppid,started,elapsed,args]=m;if(Number(pid)===process.pid)continue;
  if(!/^(?:\S*\/)?(?:node|npm|tsx)(?:\s|$)/u.test(args))continue;
  let cwd=null;try{cwd=execFileSync('lsof',['-a','-p',pid,'-d','cwd','-Fn'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n').find(v=>v.startsWith('n'))?.slice(1)??null;}catch{/* A process can exit between ps and lsof. */}
  const known=['scripts/gate.mjs','scripts/test.ts','scripts/smoke.mjs','scripts/console-preview.mjs','scripts/console-provenance-design-capture.mjs','vitest/dist/workers/forks.js','vitest/vitest.mjs','vitest run','sidecar/start.ts'];
  const task=known.find(v=>args.includes(v))??null;
  const tool=args.includes('/@oai/cua-repl/')?'codex-cua-tool':/\/bin\/codex(?:\s|$)/u.test(args)?'codex-cli':null;
  const entrypoints=args.match(/(?:\/?[A-Za-z0-9_@.+-]+\/)+[A-Za-z0-9_@.+-]+\.(?:mjs|cjs|js|ts)(?=\s|$)/gu)??[];
  if(cwd===root||args.includes(root+'/'))found.push({pid:Number(pid),ppid:Number(ppid),started,elapsed,cwd,entrypoints,task,tool,eligible:task!==null&&tool===null});
 }
 return found;
}
const args=process.argv.slice(2);
const requested=args.filter(v=>v.startsWith('--terminate-node=')).map(v=>Number(v.split('=')[1]));
if(args.some(v=>v!=='--terminate-test-sessions'&&!/^--terminate-node=\d+$/u.test(v)))throw new Error('Use no flags to inspect, --terminate-test-sessions, or --terminate-node=PID.');
console.log('Test database sessions:');
console.log(sql(`SELECT pid,datname,usename,application_name,state,backend_start,xact_start,query_start,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE ${databaseFilter} AND pid<>pg_backend_pid() ORDER BY datname,pid`));
const before=nodes();console.log(JSON.stringify({repositoryNodeProcesses:before},null,2));
if(requested.length){
 for(const pid of requested){
  const prior=before.find(v=>v.pid===pid&&v.eligible);if(!prior)throw new Error(`PID ${pid} is not a confirmed repository test/development process.`);
  const fresh=nodes().find(v=>v.pid===pid&&v.started===prior.started&&v.task===prior.task);if(!fresh)throw new Error(`PID ${pid} changed or exited; no signal sent.`);
  process.kill(pid,'SIGTERM');console.log(JSON.stringify({terminatedNode:pid,signal:'SIGTERM',task:prior.task,started:prior.started}));
 }
 await delay(2000);
 for(const pid of requested){const prior=before.find(v=>v.pid===pid),fresh=nodes().find(v=>v.pid===pid&&v.started===prior?.started&&v.task===prior?.task);if(fresh){process.kill(pid,'SIGKILL');console.log(JSON.stringify({terminatedNode:pid,signal:'SIGKILL',task:fresh.task}));}}
}
if(args.includes('--terminate-test-sessions'))console.log(sql(`SELECT pid,datname,backend_start,pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE ${databaseFilter} AND pid<>pg_backend_pid() ORDER BY datname,pid`));
if(requested.length||args.includes('--terminate-test-sessions')){console.log('Remaining test sessions:');console.log(sql(`SELECT pid,datname,application_name,state,wait_event_type,wait_event FROM pg_stat_activity WHERE ${databaseFilter} AND pid<>pg_backend_pid() ORDER BY datname,pid`));console.log(JSON.stringify({remainingRepositoryNodeProcesses:nodes()},null,2));}
