import {createServer} from 'node:http';
import {once} from 'node:events';
import {expect,it} from 'vitest';
import {XqReleaseProvider} from '../src/modules/release-custody/index.js';
it('REL-012: XQ health performs one authenticated read-only call and withholds every response body',async()=>{
 let status=200;const requests:Array<{method:string|undefined;key:string|string[]|undefined;authorization:string|string[]|undefined;url:string|undefined}>=[];
 const server=createServer((request,response)=>{requests.push({method:request.method,key:request.headers['api-key'],authorization:request.headers.authorization,url:request.url});response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify({secret:'HEALTH_RESPONSE_SENTINEL',message:'Native failure contains customer data'}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing test listener');
 const provider=new XqReleaseProvider({apiKey:'HEALTH_API_SENTINEL',dashboardApiKey:'HEALTH_DASHBOARD_SENTINEL',senderAlias:'sender',senderAccessToken:'HEALTH_ACCESS_SENTINEL',subscriptionUrl:`http://127.0.0.1:${address.port}`},'test','https://provider.invalid/redeem');
 try{
  for(const [code,result] of [[200,{reachable:true,authenticated:true,failure:null}],[401,{reachable:true,authenticated:false,failure:'authentication_refused'}],[403,{reachable:true,authenticated:false,failure:'authentication_refused'}],[500,{reachable:true,authenticated:false,failure:'provider_refused'}]] as const){status=code;expect(await provider.health()).toEqual({...result,dashboard:{status:'failed',failure:'credentials_missing'}});}
  expect(requests).toHaveLength(4);for(const request of requests){expect(request.method).toBe('GET');expect(request.key).toBe('HEALTH_API_SENTINEL');expect(request.authorization).toBe('Bearer HEALTH_ACCESS_SENTINEL');expect(request.url).toContain('/apikey?');}
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 expect(await provider.health()).toEqual({reachable:false,authenticated:false,failure:'unreachable',dashboard:{status:'failed',failure:'credentials_missing'}});
});
it('REL-012: missing deployment credentials are classified without starting a provider request',async()=>{
 const provider=new XqReleaseProvider({apiKey:'',dashboardApiKey:'',senderAlias:'',senderAccessToken:''},'test','https://provider.invalid/redeem');
 expect(await provider.health()).toEqual({reachable:false,authenticated:false,failure:'credentials_missing',dashboard:{status:'not_set',failure:null}});
});

it('REL-012: optional dashboard authentication is checked separately and cannot disable API custody',async()=>{
 const calls:Array<{url:string|undefined;authorization:string|undefined;key:string|undefined}>=[];let dashboardStatus=200;
 const server=createServer((request,response)=>{calls.push({url:request.url,authorization:request.headers.authorization,key:typeof request.headers['api-key']==='string'?request.headers['api-key']:undefined});response.writeHead(request.url?.includes('/business')?dashboardStatus:200);response.end('DASHBOARD_BODY_SENTINEL');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');const url=`http://127.0.0.1:${address.port}`;
 const config={apiKey:'api',dashboardApiKey:'dashboard',dashboardAccessToken:'dashboard-token',senderAlias:'sender',senderAccessToken:'sender-token',subscriptionUrl:url,dashboardUrl:url};
 try{
  const provider=new XqReleaseProvider(config,'test','https://provider.invalid');
  expect(await provider.health()).toEqual({reachable:true,authenticated:true,failure:null,dashboard:{status:'authenticated',failure:null}});
  dashboardStatus=401;expect(await provider.health()).toEqual({reachable:true,authenticated:true,failure:null,dashboard:{status:'failed',failure:'authentication_refused'}});
  expect(calls.filter(c=>c.url?.includes('/business'))).toHaveLength(2);expect(calls.find(c=>c.url?.includes('/business'))).toMatchObject({key:'dashboard',authorization:'Bearer dashboard-token'});
  expect(await new XqReleaseProvider({...config,dashboardApiKey:''},'test','https://provider.invalid').health()).toEqual({reachable:true,authenticated:true,failure:null,dashboard:{status:'not_set',failure:null}});
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
