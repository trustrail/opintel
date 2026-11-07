import {createServer as createTcpServer} from 'node:net';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {expect,it} from 'vitest';
import {xqRequest} from '../src/modules/release-custody/infrastructure/xq-transport.mjs';

it('XQ transport retries a pre-write setup stall once and sends the request once',async()=>{
 let requests=0,lookups=0;
 const server=createServer(async(req,res)=>{requests++;for await(const _chunk of req){/* drain */}res.end('accepted');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const result=await xqRequest(`http://test.invalid:${server.address().port}/packet`,{method:'POST'},'synthetic',{connectTimeoutMs:25,deadlineMs:1000,lookup:(_host,options,callback)=>{if(++lookups===1)return;callback(null,options.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4);}});
  expect(result).toMatchObject({status:200,attempt:2,text:'accepted'});expect(requests).toBe(1);expect(lookups).toBe(2);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
it.each(['reset','timeout','400'])('XQ transport never retries %s after writing',async mode=>{
 let requests=0;
 const server=createServer(async(req,res)=>{requests++;for await(const _chunk of req){/* drain */}if(mode==='reset')res.destroy();if(mode==='400'){res.writeHead(400);res.end('refused');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const result=xqRequest(`http://127.0.0.1:${server.address().port}/packet`,{method:'POST'},'synthetic',{connectTimeoutMs:100,deadlineMs:200});
  if(mode==='400')expect(await result).toMatchObject({status:400,attempt:1});else await expect(result).rejects.toMatchObject({attempt:1,written:true,phase:'response'});
  expect(requests).toBe(1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

it('failed DNS setup retains only its phase and allowlisted native error code',async()=>{
 await expect(xqRequest('http://test.invalid/packet',{method:'POST'},'PRIVATE_BODY',{connectTimeoutMs:20,deadlineMs:200,lookup:()=>{}})).rejects.toMatchObject({phase:'DNS',nativeErrorCode:'ETIMEDOUT',written:false,attempt:2});
});

it('default setup allowance admits a connection taking 1.5 seconds on its first attempt',async()=>{
 let requests=0,lookups=0;const server=createServer((req,res)=>{requests++;req.resume();res.end('accepted');});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const result=await xqRequest(`http://slow.invalid:${server.address().port}/packet`,{method:'POST'},'synthetic',{lookup:(_host,options,callback)=>{lookups++;setTimeout(()=>callback(null,options.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4),1500);}});
  expect(result).toMatchObject({status:200,attempt:1});expect(requests).toBe(1);expect(lookups).toBe(1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
it('connection allowance cannot extend the shared operation deadline',async()=>{
 const started=performance.now();let lookups=0;
 await expect(xqRequest('http://stall.invalid/packet',{method:'POST'},'synthetic',{deadlineMs:120,lookup:()=>{lookups++;}})).rejects.toMatchObject({kind:'deadline_exceeded',phase:'DNS',written:false,attempt:1});
 expect(lookups).toBe(1);expect(performance.now()-started).toBeLessThan(1000);
});

it('stalled TLS setup is recorded separately from TCP connection failure',async()=>{
 const sockets=new Set();const server=createTcpServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 try{await expect(xqRequest(`https://127.0.0.1:${port}/packet`,{method:'POST'},'synthetic',{connectTimeoutMs:50,deadlineMs:1000})).rejects.toMatchObject({phase:'TLS',nativeErrorCode:'ETIMEDOUT',written:false,attempt:2});}
 finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
 await expect(xqRequest(`http://127.0.0.1:${port}/packet`,{method:'POST'},'synthetic')).rejects.toMatchObject({phase:'TCP',nativeErrorCode:'ECONNREFUSED',written:false,attempt:2});
});
