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
  if(mode==='400')expect(await result).toMatchObject({status:400,attempt:1});else await expect(result).rejects.toMatchObject({attempt:1,written:true});
  expect(requests).toBe(1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
