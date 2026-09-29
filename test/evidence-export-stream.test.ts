import {once} from 'node:events';
import {get} from 'node:http';
import {it,expect} from 'vitest';
import {z} from 'zod';
import {createHttpServer,defineRoute} from '../src/platform/http/index.js';
it('downloads respect backpressure and cancel producers on disconnect',async()=>{
 let sent=0,stopped=false;const server=createHttpServer([defineRoute({method:'GET',path:'/download',params:z.object({}),request:z.undefined(),permission:'public',response:z.string(),handle:()=>({headers:{'Content-Type':'application/x-ndjson'},download:async(send,signal)=>{try{while(!signal.aborted&&sent<100000){await send('x'.repeat(65535)+'\n');sent++;}}finally{stopped=true;}}})})]);
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{const response=await new Promise<import('node:http').IncomingMessage>(resolve=>get(`http://127.0.0.1:${address.port}/download`,resolve));response.pause();await new Promise(r=>setTimeout(r,150));expect(sent).toBeGreaterThan(0);expect(sent).toBeLessThan(200);response.destroy();await expect.poll(()=>stopped).toBe(true);const last=sent;await new Promise(r=>setTimeout(r,30));expect(sent).toBe(last);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
it('a producer failure after output aborts the artifact instead of ending a successful partial file',async()=>{
 const server=createHttpServer([defineRoute({method:'GET',path:'/download',params:z.object({}),request:z.undefined(),permission:'public',response:z.string(),handle:()=>({headers:{'Content-Type':'application/x-ndjson'},download:async send=>{await send('{}\n');await new Promise(r=>setTimeout(r,20));throw new Error('failed page');}})})]);server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error();
 try{const response=await fetch(`http://127.0.0.1:${address.port}/download`);await expect(response.text()).rejects.toThrow();}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
