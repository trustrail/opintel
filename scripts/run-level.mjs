import process from 'node:process';
import console from 'node:console';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {runLedger} from './run-ledger.mjs';
import {preflightWithWarmup} from './preflight-retry.mjs';
const [file,level,...args]=process.argv.slice(2);if(!file||!['L0','L1'].includes(level))throw new Error('Usage: run-level.mjs LEDGER L0 COMMAND [ARGS] | LEDGER L1');
const commit=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),ledger=runLedger(file);
let entry;
const command=level==='L1'?['npm','run','check']:args;if(!command.length)throw new Error('L0 requires a command');
const execute=()=>new Promise((resolve,reject)=>{const child=spawn(command[0],command.slice(1),{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
try{
 if(level==='L0'){entry=ledger.start({level,stage:command.join(' '),commit});const code=await execute();entry.finish(code===0?'passed':'failed');process.exitCode=code;}
 else{
  // Reserve the budget before spawning, but charge only once a gate tier ran.
  const previous=ledger.snapshot();if(previous.entries.some(row=>row.level==='L1'&&row.charged))throw new Error('L1 budget exhausted; stop.');
  await preflightWithWarmup(async()=>{const code=await execute(),gate=existsSync('test-results/gate.json')?JSON.parse(readFileSync('test-results/gate.json','utf8')):null;if(!gate||gate.commit!==commit)throw new Error('Gate produced no matching report; stop.');if(gate.tiers.length){entry=ledger.start({level,stage:gate.tiers.at(-1).tier,commit});entry.finish(code===0&&gate.complete?'passed':'failed',{minutes:gate.wallSeconds/60,tiers:gate.tiers});process.exitCode=code;if(code!==0)console.error('L1 failed; its run budget is consumed.');return;}
   ledger.preflight({level,commit,result:'failed',durationMs:gate.wallSeconds*1000,message:gate.preflight?.message});throw new Error(gate.preflight?.message??'Gate preflight failed');
  },{record:value=>{if(value.result==='failed'&&entry)throw new Error('Do not retry an executed gate tier.');}});
 }
}catch(error){if(entry&&level==='L0')entry.finish('failed');console.error(error instanceof Error?error.message:'Validation runner failed');process.exitCode=1;}
