import {AsyncLocalStorage} from 'node:async_hooks';
export type RequestContext={route:string|null;httpStatus:number|null;refusalCode:string|null;cause:string|null};
export type Diagnostic=RequestContext&{timestamp:string;step:string;cellId:string|null;severity:'error'|'info';errorClass:string;errorCode:string|number|null;message:string;causes:Array<{errorClass:string;errorCode:string|number|null;message:string}>};
type Context=RequestContext&{step:string;cellId:string|null};
const contexts=new AsyncLocalStorage<Context>();
const empty=():RequestContext=>({route:null,httpStatus:null,refusalCode:null,cause:null});
const field=(value:unknown,key:string):unknown=>typeof value==='object'&&value!==null&&key in value?(value as Record<string,unknown>)[key]:undefined;
const identifier=(value:unknown):string|null=>typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,100}$/u.test(value)?value:null;
/** Reports never include argv, stacks, response bodies or database detail/hint/query. */
export function sanitizedMessage(value:unknown):string{
 if(typeof value!=='string')return 'Non-text error';
 return value.replace(/-----BEGIN[\s\S]*?-----END[^\n]*/gu,'[certificate redacted]')
 .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>]+/giu,'[address redacted]')
 .replace(/\b(?:Bearer\s+\S+|(?:opintel_session|password|passwd|secret|token|cookie|authorization|connectionString|host|user|dbname)\s*[:=]\s*[^\s,;]+)/giu,'[credential redacted]')
 .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,'[email redacted]')
 .replace(/(['"`])[^\n]*?\1/gu,'[value redacted]')
 .replace(/\b(?:SELECT|INSERT|UPDATE|DELETE)\s+[\s\S]*/giu,'[SQL redacted]')
 .replace(/\b(?:row|parameters|values|detail)\s*[:=][\s\S]*/giu,'[values redacted]')
 .replace(/(?:\/[\w.@-]+){2,}/gu,'[path redacted]')
 .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/gu,'[opaque value redacted]')
 .replace(/[\r\n\t]+/gu,' ').slice(0,800);
}
function description(error:unknown){
 const errorClass=error instanceof Error&&error.name==='Error'?error.constructor.name:identifier(field(error,'name'))??'NonError';
 const code=field(error,'code'),errorCode=typeof code==='number'?code:typeof code==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/u.test(code)?code:null;
 const subprocess=field(error,'cmd')!==undefined||field(error,'spawnargs')!==undefined;
 const message=subprocess?`Subprocess failure (${String(errorCode)}): ${sanitizedMessage(field(error,'stderr')??'No stderr returned')}`:typeof field(error,'stderr')==='string'&&field(error,'stderr')?`Subprocess failure (${String(errorCode)}): ${sanitizedMessage(field(error,'stderr'))}`:sanitizedMessage(error instanceof Error?error.message:typeof error==='string'?error:'Non-Error thrown');
 return {errorClass,errorCode,message};
}
class DiagnosedError extends Error {constructor(readonly diagnostic:Diagnostic,original:unknown){super(diagnostic.message,{cause:original});this.name='VerifierDiagnosticError';}}
export function diagnostic(error:unknown,step:string,options:{cellId?:string;severity?:'error'|'info';request?:RequestContext}={}):Diagnostic{
 if(error instanceof DiagnosedError)return {...error.diagnostic,...((error.diagnostic.step==='public-api'||options.cellId!==undefined)&&step!=='public-api'?{step}:{}),cellId:options.cellId??error.diagnostic.cellId,severity:options.severity??error.diagnostic.severity};
 const causes:Diagnostic['causes']=[],seen=new Set<unknown>();let next=field(error,'cause');
 while(next!==undefined&&!seen.has(next)&&causes.length<8){seen.add(next);causes.push(description(next));next=field(next,'cause');}
 const nested=field(error,'errors');if(Array.isArray(nested))for(const item of nested.slice(0,8))causes.push(description(item));
 return {timestamp:new Date().toISOString(),step,cellId:options.cellId??null,severity:options.severity??'error',...empty(),...options.request,...description(error),causes};
}
export async function setupStep<T>(step:string,operation:()=>Promise<T>,cellId?:string):Promise<T>{
 return contexts.run({...empty(),step,cellId:cellId??null},async()=>{try{return await operation();}catch(error){const current=contexts.getStore()!;throw new DiagnosedError(diagnostic(error,step,{cellId,request:current}),error);}});
}
export function requestContext(route:string,httpStatus:number|null=null,refusal?:unknown){
 const context=contexts.getStore();if(!context)return;
 const e=field(refusal,'error')??refusal;
 Object.assign(context,{route:route.split('?')[0]!,httpStatus,refusalCode:identifier(field(e,'code')),cause:identifier(field(e,'cause'))??identifier(field(field(e,'details'),'cause'))});
}
export function diagnosticText(d:Diagnostic){return `${d.step}${d.cellId?' / '+d.cellId:''}: ${d.errorClass}${d.errorCode===null?'':' ['+d.errorCode+']'}: ${d.message}; route=${d.route??'not applicable'}; HTTP=${d.httpStatus??'not available'}; refusal=${d.refusalCode??'none recorded'}; cause=${d.cause??'none recorded'}${d.causes.map(c=>' / '+c.errorClass+' ['+c.errorCode+']: '+c.message).join('')}`;}
