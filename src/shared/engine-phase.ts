export type EnginePhase='arrival'|'queue'|'validate'|'execute'|'scan'|'stage'|'treat'|'seal'|'respond';
/** No SQL, rows, keys, addresses, exception text or free-form phase labels. */
export function enginePhase(requestId:string,phase:EnginePhase,state:'start'|'end'|'aborted',timestamp=new Date().toISOString()):void{
 if(!/^[a-zA-Z0-9:_-]{1,128}$/u.test(requestId))return;
 console.info({event:'engine.request_phase',timestamp,requestId,phase,state});
}
