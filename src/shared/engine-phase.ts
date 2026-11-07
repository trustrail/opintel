import {AsyncLocalStorage} from 'node:async_hooks';
export type EnginePhase='arrival'|'queue'|'validate'|'execute'|'scan'|'stage'|'treat'|'seal'|'respond';
export const validationStages=['request_body','session_open','duckdb_open','instance_create','connection_open','namespace','table_create','search_path','harden','build','columns','objects','external_state','statement','parse','prepare','session_close'] as const;
export type ValidationStage=typeof validationStages[number];
const calls=new AsyncLocalStorage<string|undefined>();
const validCall=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
export const engineCallId=()=>calls.getStore();
export function withEngineCall<T>(value:unknown,work:()=>T):T{return calls.run(validCall(value)?value:undefined,work);}
/** No SQL, rows, keys, addresses, exception text or free-form phase labels. */
export function enginePhase(requestId:string,phase:EnginePhase,state:'start'|'end'|'aborted',timestamp=new Date().toISOString(),detail:{callId?:string;stage?:ValidationStage;durationMs?:number}={}):void{
 if(!/^[a-zA-Z0-9:_-]{1,128}$/u.test(requestId))return;
 const callId=detail.callId??calls.getStore();
 console.info({event:'engine.request_phase',timestamp,requestId,phase,state,...(validCall(callId)?{callId}:{}),...(detail.stage&&validationStages.includes(detail.stage)?{stage:detail.stage}:{}),...(detail.durationMs!==undefined&&Number.isFinite(detail.durationMs)&&detail.durationMs>=0?{durationMs:detail.durationMs}:{})});
}
export async function validationProgress<T>(requestId:string,stage:ValidationStage,work:()=>Promise<T>):Promise<T>{
 const started=performance.now();enginePhase(requestId,'validate','start',undefined,{stage,durationMs:0});
 try{const result=await work();enginePhase(requestId,'validate','end',undefined,{stage,durationMs:Math.max(0,performance.now()-started)});return result;}
 catch(error){enginePhase(requestId,'validate','aborted',undefined,{stage,durationMs:Math.max(0,performance.now()-started)});throw error;}
}
