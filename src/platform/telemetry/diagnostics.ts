import {AsyncLocalStorage} from 'node:async_hooks';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createWriteStream,type WriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import type {Server} from 'node:http';

type RequestContext={requestId:string;requestKind:'console'|'observer'|'agent_control'|'agent_query'|'engine_receipt';operation:string|null};
const requests=new AsyncLocalStorage<RequestContext>(),contexts=new WeakMap<ServerResponse,RequestContext>();
type DiagnosticWork='mcp_refresh'|'presence_sweep'|'introspection_completion'|'custody_rehearsal'|'ordinal_repair'|'release_cleanup';
const background=new AsyncLocalStorage<DiagnosticWork>();
export function withDiagnosticWork<T>(work:DiagnosticWork,run:()=>T):T{return diagnosticsEnabled()?background.run(work,run):run();}
export const diagnosticRequest=()=>requests.getStore();
export function withDiagnosticRequest<T>(request:IncomingMessage,response:ServerResponse,requestId:string,run:()=>T):T{
 if(!diagnosticsEnabled())return run();
 const context:RequestContext={requestId,requestKind:(request.url??'').startsWith('/mcp/')?'agent_control':['/landing-receipt','/arrival-notice','/reconciliation-report'].includes(request.url??'')?'engine_receipt':request.headers['x-opintel-diag-client']==='soak-observer'?'observer':'console',operation:null};
 contexts.set(response,context);diagnostic({kind:'http_start',requestId,requestKind:context.requestKind,method:request.method??'',path:(request.url??'/').split('?')[0]!});return requests.run(context,run);
}
export function diagnosticMcpOperation(body:unknown):void{
 const context=requests.getStore();if(!context||!body||typeof body!=='object')return;
 if(!('method' in body)){if('result' in body||'error' in body)context.operation='protocol_response';return;}
 if(typeof body.method!=='string')return;
 const params='params' in body?body.params:undefined;
 const tool=body.method==='tools/call'&&params&&typeof params==='object'&&'name' in params&&typeof params.name==='string'?params.name:null;
 context.operation=tool&&['opintel.query','opintel.explain','opintel.describe','opintel.redeem'].includes(tool)?tool:['initialize','ping','tools/list','notifications/initialized'].includes(body.method)?body.method:'other';
 if(tool==='opintel.query')context.requestKind='agent_query';
}
let output:WriteStream|undefined;
let poolSample:(()=>{total:number;idle:number;waiting:number})|undefined;
export const diagnosticsEnabled=()=>output!==undefined;
export function registerDiagnosticPool(sample:()=>{total:number;idle:number;waiting:number}):void{poolSample=sample;}
export function diagnostic(record:Readonly<Record<string,string|number|boolean|null|readonly string[]>>):void{
 output?.write(JSON.stringify({timestamp:new Date().toISOString(),...record,...(record.kind==='db'||record.kind==='db_acquire'?{backgroundWork:diagnosticRequest()?null:background.getStore()??'unlabelled'}:{})})+'\n');
}
/** Local opt-in measurements only: no SQL, query strings, headers or bodies. */
export async function startDiagnostics():Promise<void>{
 if(process.env.OPINTEL_DIAG!=='1'||output)return;
 await mkdir('tmp/diag',{recursive:true,mode:0o700});
 const path=`tmp/diag/${new Date().toISOString().replaceAll(':','-')}.jsonl`;
 const stream=createWriteStream(path,{flags:'wx',mode:0o600});
 output=stream;
 stream.on('error',()=>{output=undefined;console.error('API diagnostics output failed; measurements are incomplete.');});
 console.info(`API diagnostics: ${path}`);
 const delay=monitorEventLoopDelay({resolution:20});delay.enable();
 const timer=setInterval(()=>{
  diagnostic({kind:'eventloop',mean:Number.isFinite(delay.mean)?delay.mean/1e6:null,p99:delay.percentile(99)/1e6,max:delay.max/1e6});
  delay.reset();
  if(poolSample)diagnostic({kind:'pool',...poolSample()});
 },1000);
 timer.unref();
}
export function instrumentHttp(server:Server|import('node:https').Server):void{
 if(!diagnosticsEnabled())return;
 server.prependListener('request',(request,response)=>{
  const started=performance.now();let recorded=false;
  const write=()=>{if(recorded)return;recorded=true;diagnostic({kind:'http',requestId:contexts.get(response)?.requestId??String(response.getHeader('x-request-id')??''),requestKind:contexts.get(response)?.requestKind??'unattributed',operation:contexts.get(response)?.operation??null,method:request.method??'',path:(request.url??'/').split('?')[0]!,status:response.headersSent?response.statusCode:0,durationMs:performance.now()-started});};
  response.once('finish',write);response.once('close',write);
 });
}
