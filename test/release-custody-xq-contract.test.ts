import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {XqReleaseProvider} from '../src/modules/release-custody/index.js';

it('XQ SDK service contract: stored recipient without alias authorization, joined recipients, split packet requests, receipt metadata, fetch and locator-list revocation',async()=>{
 const calls:Array<{path:string;method:string|undefined;body:string;key:string|undefined;authorization:string|undefined}>=[];
 const share=Buffer.alloc(32,7),encoded=share.toString('base64url'),alias='opaque-device-recipient',receipt=randomUUID(),locator='locator/opaque';
 const server=createServer(async(request,response)=>{
  const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array));
  const path=request.url??'',body=Buffer.concat(chunks).toString();
  calls.push({path,method:request.method,body,key:typeof request.headers['api-key']==='string'?request.headers['api-key']:undefined,authorization:request.headers.authorization});
  response.writeHead(200,{'content-type':'text/plain'});
  response.end(path==='/subscription/packet'?'opaque-packet':path==='/validation/packet'?locator:request.method==='GET'?encoded:'');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');const base=`http://127.0.0.1:${address.port}`;
 const provider=new XqReleaseProvider({apiKey:'general',dashboardApiKey:'dashboard',senderAlias:'sender',senderAccessToken:'sender-token',subscriptionUrl:base+'/subscription',validationUrl:base+'/validation'},'tenant','https://provider.invalid/redeem');
 try{
  expect(await provider.escrow(share,alias,3601,true,receipt)).toBe(locator);
  expect(await provider.fetch(locator,alias,'recipient-token')).toEqual(share);
  await provider.revoke(locator);
  expect(calls).toHaveLength(4);
  expect(calls[0]).toMatchObject({path:'/subscription/packet',method:'POST',key:'general',authorization:'Bearer sender-token'});
  expect(JSON.parse(calls[0]!.body)).toEqual({key:encoded,recipients:alias,expires:2,dor:true,type:8,meta:{receipt}});
  expect(calls[1]).toMatchObject({path:'/validation/packet',method:'POST',body:'opaque-packet',key:'general',authorization:'Bearer sender-token'});
  expect(calls[2]).toMatchObject({path:'/validation/key/'+encodeURIComponent(locator),method:'GET',key:'general',authorization:'Bearer recipient-token'});
  // SDK call() also puts DELETE parameters in the query string; makeRequest sends
  // the same tokens list as its body. The pinned 2.0.6 service requires tokens; GitHub 1.9.0 instead requires locatorKeys.
  expect(calls[3]).toMatchObject({method:'DELETE',key:'general',authorization:'Bearer sender-token'});
  expect(new URL(calls[3]!.path,base).pathname).toBe('/validation/key');
  expect(new URL(calls[3]!.path,base).searchParams.get('tokens')).toBe(locator);
  expect(JSON.parse(calls[3]!.body)).toEqual({tokens:[locator]});
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it.each(['subscription','validation'])('XQ escrow %s HTTP 400 records its code and does not retry either subcall',async subcall=>{
 const calls:string[]=[];
 const server=createServer(async(req,res)=>{
  for await(const _chunk of req){/* Drain the synthetic request. */}
  calls.push(req.url??'');
  if(req.url===`/${subcall}/packet`){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({code:'PACKET_REFUSED',message:'PRIVATE_PROVIDER_DIAGNOSTIC'}));}
  else res.end('opaque-synthetic-packet');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');
 const base=`http://127.0.0.1:${address.port}`;
 const provider=new XqReleaseProvider({apiKey:'synthetic',dashboardApiKey:'synthetic',senderAlias:'synthetic',senderAccessToken:'synthetic',subscriptionUrl:base+'/subscription',validationUrl:base+'/validation'},'tenant','https://provider.invalid/redeem');
 try{
  await expect(provider.escrow(Buffer.alloc(32,7),'synthetic-recipient',3600,true,randomUUID())).rejects.toMatchObject({failure:{kind:'http_refused',status:400,subcall,providerCode:'PACKET_REFUSED',attempt:1}});
  expect(calls).toEqual(subcall==='subscription'?['/subscription/packet']:['/subscription/packet','/validation/packet']);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
