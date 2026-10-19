import {createWriteStream,type WriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import type {Server} from 'node:http';

let output:WriteStream|undefined;
let poolSample:(()=>{total:number;idle:number;waiting:number})|undefined;
export const diagnosticsEnabled=()=>output!==undefined;
export function registerDiagnosticPool(sample:()=>{total:number;idle:number;waiting:number}):void{poolSample=sample;}
export function diagnostic(record:Readonly<Record<string,string|number|null>>):void{
 output?.write(JSON.stringify({timestamp:new Date().toISOString(),...record})+'\n');
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
  const write=()=>{if(recorded)return;recorded=true;diagnostic({kind:'http',method:request.method??'',path:(request.url??'/').split('?')[0]!,status:response.headersSent?response.statusCode:0,durationMs:performance.now()-started});};
  response.once('finish',write);response.once('close',write);
 });
}
