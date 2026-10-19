import {spawn,type ChildProcess} from 'node:child_process';
import {readFile,unlink} from 'node:fs/promises';
import {readinessFailure,readinessMessages,type ReadinessFailure} from '../src/shared/engine-readiness.js';
import {EngineStderrTail} from './stderr-tail.js';
import {performance} from 'node:perf_hooks';

/** Call only after reaping the owned child; state files are never removed. */
export async function releaseChildLocks(paths:readonly string[],pid:number):Promise<number>{
 let released=0;
 for(const path of paths){try{if((await readFile(path,'utf8')).trim()===String(pid)){await unlink(path);released++;}}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}}
 return released;
}

export const restartDelaysMs=[1000,2000,4000,8000,16000] as const;
export const stablePeriodMs=60_000;
/** Replenish only after readiness and sustained responsive child heartbeats. */
export async function supervise(options:{command:string;args:string[];signal:AbortSignal;shutdownMs:number;log:(entry:Record<string,unknown>)=>void;beforeStart?:()=>Promise<void>;afterExit?:(pid:number,reason?:ReadinessFailure)=>Promise<void>;delays?:readonly number[];stableMs?:number}):Promise<number>{
 const delays=options.delays??restartDelaysMs;
 let attempt=0;
 for(;;){
  if(options.signal.aborted)return 0;
  await options.beforeStart?.();
  const outcome=await new Promise<{code:number|null;signal:ChildProcess['signalCode'];pid?:number;readinessReason?:ReadinessFailure}&ReturnType<EngineStderrTail['snapshot']>>(resolve=>{
   const child:ChildProcess=spawn(options.command,options.args,{stdio:['inherit','inherit','pipe','ipc']});
   const stderr=new EngineStderrTail();child.stderr?.on('data',(chunk:Buffer)=>{stderr.push(chunk);process.stderr.write(chunk);});
   let killTimer:ReturnType<typeof setTimeout>|undefined;let settled=false;
   let readyAt:number|undefined,lastBeat=0,readinessReason:ReadinessFailure|undefined;
   child.on('message',message=>{if(message&&typeof message==='object'&&'event'in message&&message.event==='engine.readiness_failed'&&'reason'in message){const parsed=readinessFailure.safeParse(message.reason);if(parsed.success)readinessReason=parsed.data;}if(message&&typeof message==='object'&&'event'in message&&message.event==='engine.healthy'){const now=performance.now();if(readyAt===undefined||now-lastBeat>10_000){readyAt=now;options.log({event:'engine.child_ready',pid:child.pid});}lastBeat=now;}});
   const stableTimer=setInterval(()=>{if(readyAt!==undefined&&performance.now()-lastBeat<=10_000&&performance.now()-readyAt>=(options.stableMs??stablePeriodMs)&&attempt>0){options.log({event:'engine.restart_budget_reset',previousFailures:attempt,stableMs:options.stableMs??stablePeriodMs,pid:child.pid});attempt=0;}},Math.min(1000,options.stableMs??stablePeriodMs));
   const stop=()=>{child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),options.shutdownMs);};
   const done=(code:number|null,signal:ChildProcess['signalCode'])=>{if(settled)return;settled=true;options.signal.removeEventListener('abort',stop);clearTimeout(killTimer);clearInterval(stableTimer);stderr.finish();resolve({code,signal,pid:child.pid,...stderr.snapshot(),...(readinessReason?{readinessReason}:{})});};
   child.once('error',()=>done(1,null));child.once('close',done);
   options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop();
  });
  options.log({event:'engine.process_exited',attempt,...outcome});
  if(outcome.pid)await options.afterExit?.(outcome.pid,outcome.readinessReason);
  if(options.signal.aborted){options.log({event:'engine.supervisor_stopped'});return 0;}
  const delayMs=delays[attempt];
  if(delayMs===undefined){options.log({event:'engine.restart_exhausted',restarts:attempt,state:'stopped',readinessReason:outcome.readinessReason??'engine_process_stopped',message:readinessMessages[outcome.readinessReason??'engine_process_stopped'],action:'Inspect Engine diagnostics, correct the cause, then restart the supervisor.'});return 1;}
  options.log({event:'engine.restart_scheduled',restart:attempt+1,delayMs});
  await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);options.signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,delayMs);options.signal.addEventListener('abort',finish,{once:true});if(options.signal.aborted)finish();});
  if(!options.signal.aborted){attempt++;options.log({event:'engine.restarting',restart:attempt});}
 }
}
