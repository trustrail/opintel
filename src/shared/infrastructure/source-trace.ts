import {AsyncLocalStorage} from 'node:async_hooks';
import type {SourceFailure,SourceOperation} from '../source-failure.js';
export function sourceOperationEvent(requestId:string|undefined,operation:SourceOperation,state:'start'|'end'|'failed',attempt:number,failure?:SourceFailure):void{
 if(!requestId||!/^[a-zA-Z0-9:_-]{1,128}$/u.test(requestId))return;
 const timestamp=new Date().toISOString();
 const context=sourceContext.getStore();if(context)context.last={failure:failure??{operation,attempt,nativeCode:null,sqlState:null},state,timestamp};
 console.info({event:'engine.source_operation',timestamp,requestId,operation,state,attempt,...(failure?{failure}: {})});
}

export type SourcePhaseRecord={failure:SourceFailure;state:'start'|'end'|'failed';timestamp:string};
const sourceContext=new AsyncLocalStorage<{last?:SourcePhaseRecord}>();
export const withSourceTrace=<T>(work:()=>T):T=>sourceContext.run({},work);
export const lastSourcePhase=():SourcePhaseRecord|undefined=>sourceContext.getStore()?.last;
