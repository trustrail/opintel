import {performance} from 'node:perf_hooks';
import {setTimeout} from 'node:timers/promises';
/** Exactly one retry, only before a real stage starts. Never retries tests. */
export async function preflightWithWarmup(check,{warmup=()=>setTimeout(10000),record=()=>{},now=()=>performance.now()}={}){
 for(let attempt=1;attempt<=2;attempt++){
  const began=now();try{const value=await check();record({attempt,result:'passed',durationMs:now()-began});return value;}catch(error){record({attempt,result:'failed',durationMs:now()-began,message:error instanceof Error?error.message:'Preflight failed'});if(attempt===2)throw error;await warmup();}
 }
}
