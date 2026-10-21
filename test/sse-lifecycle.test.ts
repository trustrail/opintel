import {once} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {createHttpServer,defineRoute} from '../src/platform/http/index.js';
import {diagnostic} from '../src/platform/telemetry/diagnostics.js';
import {streamEventSchema,type StreamEvent} from '../src/shared/api/stream.js';

vi.mock('../src/platform/telemetry/diagnostics.js',async original=>({...await original<typeof import('../src/platform/telemetry/diagnostics.js')>(),diagnostic:vi.fn()}));
const servers:ReturnType<typeof createHttpServer>[]=[];
afterEach(async()=>{
 vi.useRealTimers();
 for(const server of servers){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 servers.length=0;vi.clearAllMocks();
});

it.each(['client_close','backpressure_event','backpressure_keepalive','upstream_close','error'] as const)('SSE lifecycle counts snapshots and one close with reason %s',async cause=>{
 if(cause==='backpressure_keepalive')vi.useFakeTimers({toFake:['setInterval','clearInterval']});
 const project='de000000-0000-4000-8000-000000000003';
 let upstream:((event:StreamEvent|null)=>void)|undefined;
 const server=createHttpServer([defineRoute({method:'GET',path:'/api/v1/projects/:id/stream',params:z.object({id:z.uuid()}),request:z.undefined(),response:streamEventSchema,permission:'public',handle:()=>({stream:async(send,signal)=>{
  upstream=send;
  signal.addEventListener('abort',()=>send(null),{once:true});
  send({type:'snapshot',at:new Date().toISOString(),sequence:0,invalidate:['agentPresence']});
  if(cause==='error')throw new Error('Synthetic stream failure');
 }})})]);
 servers.push(server);
 // Exercise the real HTTP lifecycle, but force the actual write return value
 // at the transport boundary so slow-client behavior is deterministic.
 server.prependListener('request',(_request,response)=>{
  const write=response.write;
  response.write=(chunk:unknown,...args:unknown[]):boolean=>{
   const writable=Reflect.apply(write,response,[chunk,...args]) as boolean;
   return cause==='backpressure_event'&&String(chunk).startsWith('data: ')||cause==='backpressure_keepalive'&&String(chunk).startsWith(': keepalive')?false:writable;
  };
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 const response=await fetch(`http://127.0.0.1:${address.port}/api/v1/projects/${project}/stream`);
 const reader=response.body!.getReader();await reader.read();
 if(cause==='client_close')await reader.cancel();
 else if(cause==='upstream_close')upstream?.(null);
 else if(cause==='backpressure_keepalive')await vi.advanceTimersByTimeAsync(15_000);
 await vi.waitFor(()=>expect(vi.mocked(diagnostic).mock.calls.filter(([r])=>r.kind==='sse_close')).toHaveLength(1));
 const records=vi.mocked(diagnostic).mock.calls.map(([record])=>record);
 expect(records.filter(r=>r.kind==='sse_open')).toEqual([expect.objectContaining({projectId:project})]);
 expect(records.filter(r=>r.kind==='sse_snapshot')).toEqual([expect.objectContaining({projectId:project,writable:cause!=='backpressure_event'})]);
 expect(records.filter(r=>r.kind==='sse_close')).toEqual([expect.objectContaining({projectId:project,reason:cause,events:1,snapshots:1})]);
 await reader.cancel();
});
