import {Agent,createServer,request} from 'node:http';
import {Buffer} from 'node:buffer';
import {it,expect} from 'vitest';
import {acceptanceJson,acceptanceRequest,acceptanceDeadlineMs} from '../scripts/images/acceptance-json.mjs';
it('FH-004: acceptance sends a correctly framed UTF-8 JSON body for DELETE as well as POST and PUT',async()=>{
 const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const text=Buffer.concat(chunks).toString('utf8');res.setHeader('content-type','application/json');res.end(JSON.stringify({body:JSON.parse(text),bytes:Number(req.headers['content-length'])}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const method of ['POST','PUT','DELETE']){
  const body={projectId:'synthetic',label:'é'},json=acceptanceJson(body,{'content-type':'application/json'});
  const received=await new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port:server.address().port,method,headers:json.headers},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(text)}));});req.on('error',reject);req.end(json.payload);});
  expect(received).toEqual({status:200,body,bytes:Buffer.byteLength(JSON.stringify(body))});
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
it('FH-005: browser API calls carry their origin/cookie; agent calls use the bearer without default browser headers',()=>{
 const api=acceptanceRequest('/api/v1/pools/p/tables','https://gateway.invalid',{projectId:'p'},'session=synthetic');
 expect(api.headers.origin).toBe('https://gateway.invalid');expect(api.headers.cookie).toBe('session=synthetic');
 const agent=acceptanceRequest('/mcp/v1/p/p','https://gateway.invalid',{method:'initialize'},'session=synthetic',{authorization:'Bearer synthetic'});
 expect(agent.headers.origin).toBeUndefined();expect(agent.headers.cookie).toBeUndefined();expect(agent.headers.authorization).toBe('Bearer synthetic');
 // An explicit caller-supplied origin still reaches the server's refusal;
 // the harness must not turn a browser caller into a permitted agent.
 expect(acceptanceRequest('/mcp/v1/p/p','https://gateway.invalid',{},undefined,{origin:'https://browser.invalid'}).headers.origin).toBe('https://browser.invalid');
});

it('FH-006: acceptance uses its declared request deadline rather than an inherited shorter Agent timeout',async()=>{
 const server=createServer((_req,res)=>{setTimeout(()=>res.end('ok'),100);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const agent=new Agent({keepAlive:true,timeout:5});
 try{
  const result=await new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port:server.address().port,agent,timeout:acceptanceDeadlineMs},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('timeout',()=>req.destroy(new Error('Unexpected inherited Agent timeout')));req.on('error',reject);req.end();});
  expect(result).toBe(200);
 }finally{agent.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
