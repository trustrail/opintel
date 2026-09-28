import type { Result } from '../../../src/shared/kernel/index.js';
import type { ExecutionRequest,StagingObject } from '../../../src/shared/execution-contract.js';
import type { EngineSession } from '../../session/index.js';
export type Scan={object:StagingObject;predicate:string|null;request:ExecutionRequest};
export interface StagingSource {
 estimate(scan:Scan,signal:AbortSignal):Promise<Result<number|null>>;
 plain(scan:Scan,privileged:EngineSession,table:string,signal:AbortSignal):Promise<Result<void>>;
 treated(scan:Scan,consume:(rows:unknown[][])=>Promise<Result<void>>,signal:AbortSignal):Promise<Result<void>>;
}
export interface DeadlineClock{after(milliseconds:number,expire:()=>void):()=>void}
export const deadlineClock:DeadlineClock={after(ms,expire){const timer=setTimeout(expire,ms);return ()=>clearTimeout(timer);}};

export type ExecutionEvent={event:'execution.completed'|'execution.refused';requestId:string;projectId:string;poolId:string;operation:'validate'|'execute';reason?:string};
export interface ExecutionAudit{record(event:ExecutionEvent):void}
export const executionAudit:ExecutionAudit={record(event){
 // Explicit allowlist: neither SQL/tree/literals nor result rows can be logged.
 console.info({event:event.event,requestId:event.requestId,projectId:event.projectId,poolId:event.poolId,operation:event.operation,...(event.reason?{reason:event.reason}:{})});
}};
