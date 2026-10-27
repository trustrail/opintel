import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {custodyEscrowRequest} from '../src/shared/custody-failure.js';
import {XqReleaseProvider} from '../src/modules/release-custody/index.js';

it('XQ SDK service contract: stored recipient without alias authorization, joined recipients, split packet requests, receipt metadata, fetch and locator-list revocation',async()=>{
 const calls:Array<{path:string;method:string|undefined;body:string;key:string|undefined;authorization:string|undefined}>=[];
 const share=Buffer.alloc(32,255),encoded=Buffer.from(share.toString('hex'),'ascii').toString('base64'),alias='opaque-device-récipient',receipt=randomUUID(),locator='locator/opaque';
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
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
  expect(log).toHaveBeenCalledTimes(2);
  const diagnostics=log.mock.calls.map(([value])=>{expect(typeof value).toBe('string');const {event,...fields}=JSON.parse(value as string) as Record<string,unknown>;expect(event).toBe('custody.xq_escrow_request');return custodyEscrowRequest.parse({type:'escrow-request',...fields});});
  expect(diagnostics.map(d=>d.requestBytes)).toEqual(calls.slice(0,2).map(c=>Buffer.byteLength(c.body)));
  expect(diagnostics[0]).toMatchObject({evidenceId:receipt,subcall:'subscription',status:200,attempt:1,written:true,requestShape:{encoding:'json',fieldCount:6,keyCharacters:88,keySignature:{nonAlphanumeric:['='],firstClass:'upper',doubledPunctuation:['=']},recipientCharacters:alias.length,expiresHours:2,singleUse:true,storageType:8,receiptCharacters:36}});
  expect(diagnostics[1]).toMatchObject({subcall:'validation',requestShape:{encoding:'text'}});
  for(const d of diagnostics)expect(Date.parse(d.completedAt)).toBeGreaterThanOrEqual(Date.parse(d.startedAt));
  for(const secret of [encoded,alias,locator,'sender-token','recipient-token','opaque-packet'])expect(JSON.stringify(diagnostics)).not.toContain(secret);
 }finally{log.mockRestore();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it.each(['subscription','validation'])('XQ escrow %s HTTP 400 records its code and does not retry either subcall',async subcall=>{
 const calls:string[]=[],bytes:number[]=[];
 const server=createServer(async(req,res)=>{
  let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk as Uint8Array);}bytes.push(size);
  calls.push(req.url??'');
  if(req.url===`/${subcall}/packet`){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({code:'PACKET_REFUSED',message:'Alias is not active',access_token:'PRIVATE_PROVIDER_DIAGNOSTIC',detail:'synthetic-recipient'}));}
  else res.end('opaque-synthetic-packet');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');
 const base=`http://127.0.0.1:${address.port}`;
 const provider=new XqReleaseProvider({apiKey:'synthetic',dashboardApiKey:'synthetic',senderAlias:'synthetic',senderAccessToken:'synthetic',subscriptionUrl:base+'/subscription',validationUrl:base+'/validation'},'tenant','https://provider.invalid/redeem');
 try{
  let failure:unknown;try{await provider.escrow(Buffer.alloc(32,7),'synthetic-recipient',3600,true,randomUUID());}catch(error){failure=error;}
  expect(failure).toMatchObject({failure:{kind:'http_refused',status:400,subcall,providerCode:'PACKET_REFUSED',attempt:1,requestBytes:bytes.at(-1),requestShape:{keySignature:{nonAlphanumeric:['='],firstClass:'upper',doubledPunctuation:['=']}},responseBody:{text:JSON.stringify({code:'PACKET_REFUSED',message:'Alias is not active',maskedField2:'[masked]',detail:'[masked]'}),truncated:false}}});
  expect(calls).toEqual(subcall==='subscription'?['/subscription/packet']:['/subscription/packet','/validation/packet']);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it.each(['legacy','sdk'])('retrieves an existing %s grant without re-escrowing or rewriting its accepted key',async format=>{
 const share=Buffer.alloc(32,255),wire=format==='legacy'?share.toString('base64url'):Buffer.from(share.toString('hex')).toString('base64'),calls:string[]=[];
 const server=createServer((req,res)=>{calls.push(req.method+' '+req.url);res.end(wire);});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');
 const base=`http://127.0.0.1:${address.port}`,provider=new XqReleaseProvider({apiKey:'synthetic',dashboardApiKey:'synthetic',senderAlias:'synthetic',senderAccessToken:'synthetic',validationUrl:base+'/validation'},'tenant','https://provider.invalid/redeem');
 try{expect(await provider.fetch('already-issued-locator','recipient','synthetic-token')).toEqual(share);expect(calls).toEqual(['GET /validation/key/already-issued-locator']);}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
