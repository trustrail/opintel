import {z} from 'zod';

export const sourceOperation=z.enum(['credentials','connect','backend_identity','begin','settings','metadata','estimate','declare','fetch','close','commit','statement','scanner']);
export type SourceOperation=z.infer<typeof sourceOperation>;
export const sourceFailure=z.strictObject({
 operation:sourceOperation,
 nativeCode:z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/u).nullable(),
 sqlState:z.string().regex(/^[0-9A-Z]{5}$/u).nullable(),
 attempt:z.number().int().min(1).max(2),
});
export type SourceFailure=z.infer<typeof sourceFailure>;
const diagnostics=new WeakMap<object,SourceFailure>();
export function retainSourceFailure(error:unknown,operation:SourceOperation,attempt:number):SourceFailure{
 const code=z.object({code:z.string()}).safeParse(error);
 const value=code.success?code.data.code:'';
 const detail:SourceFailure={operation,attempt,sqlState:/^[0-9A-Z]{5}$/u.test(value)?value:null,nativeCode:/^[A-Z][A-Z0-9_]{1,47}$/u.test(value)&&value.length!==5?value:null};
 if(typeof error==='object'&&error!==null&&!diagnostics.has(error))diagnostics.set(error,detail);
 return getSourceFailure(error)??detail;
}
export function getSourceFailure(error:unknown):SourceFailure|undefined{
 return typeof error==='object'&&error!==null?diagnostics.get(error):undefined;
}
export function sourceOperationEvent(requestId:string|undefined,operation:SourceOperation,state:'start'|'end'|'failed',attempt:number,failure?:SourceFailure):void{
 if(!requestId||!/^[a-zA-Z0-9:_-]{1,128}$/u.test(requestId))return;
 console.info({event:'engine.source_operation',timestamp:new Date().toISOString(),requestId,operation,state,attempt,...(failure?{failure}: {})});
}
