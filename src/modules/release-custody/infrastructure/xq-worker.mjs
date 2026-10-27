import {xqRequest} from './xq-transport.mjs';
import {parentPort,workerData} from 'node:worker_threads';
import {webcrypto} from 'node:crypto';
// XQ's Gateway/Transfer licence guidance recommends database (8) for our key packets.
const XQ_DATABASE_STORAGE_TYPE=8;
// jssdk-core 2.0.6 inspects a browser platform at import even for key-only
// operations. Keep that compatibility surface in a disposable worker, never
// mutate the application's globals or use the SDK's encryption implementation.
globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
// The SDK error handler prints provider bodies. No vendor diagnostics may escape
// this worker into application logs, including health-check failure bodies.
globalThis.console.log=globalThis.console.info=globalThis.console.warn=globalThis.console.error=globalThis.console.debug=()=>{};
let failure;
try{
 const {XQSDK,GeneratePacket,RevokeKeyAccess,FetchKey,CheckApiKey,ServerResponse}=await import('@xqmsg/jssdk-core');
 const {configuration,operation,alias,recipientIdentifier,locator,share,ttlSeconds,receipt}=workerData;
 const sdk=new XQSDK({XQ_API_KEY:configuration.apiKey,DASHBOARD_API_KEY:configuration.dashboardApiKey});
 // Explicit infrastructure injection for local adapter contract tests; never
 // exposed through Settings or agent input.
 if(configuration.dashboardUrl)sdk.DASHBOARD_SERVER_URL=configuration.dashboardUrl;
 if(configuration.subscriptionUrl)sdk.SUBSCRIPTION_SERVER_URL=configuration.subscriptionUrl;
 if(configuration.validationUrl)sdk.VALIDATION_SERVER_URL=configuration.validationUrl;
 let healthStatus;
 // Explicit connect-before-write transport; no SDK cache or request replay.
 sdk.makeRequest=async(url,method,service,headers,payload,requiresApiKey)=>{
  const requestHeaders={...headers};if(requiresApiKey)requestHeaders['api-key']=configuration.apiKey;
  const plain=requestHeaders['content-type']==='text/plain;charset=UTF-8';if(!plain)requestHeaders['content-type']='application/json';
  const subcall=url.startsWith(sdk.SUBSCRIPTION_SERVER_URL+'/')?'subscription':url.startsWith(sdk.VALIDATION_SERVER_URL+'/')?'validation':'other';
  let response;
  try{response=await xqRequest(url,{method,headers:requestHeaders},method==='GET'?undefined:plain?payload?.data:JSON.stringify(payload));}
  catch(error){failure={kind:error.kind??'unreachable',subcall,providerCode:null,attempt:error.attempt??1};throw error;}
  const ok=response.status>=200&&response.status<300;
  let value;try{value=JSON.parse(response.text);}catch{value=response.text;}
  if(!ok){
   const raw=value&&typeof value==='object'?(value.code??value.errorCode??value.error?.code):undefined;
   const code=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
   failure={kind:'http_refused',status:response.status,subcall,providerCode:typeof code==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,47}$/u.test(code)?code:null,attempt:response.attempt};
  }
  if(operation==='health'){healthStatus=response.status;return new ServerResponse(ok?ServerResponse.OK:ServerResponse.ERROR,response.status,null);}
  return new ServerResponse(ok?ServerResponse.OK:ServerResponse.ERROR,response.status,value);
 };
 sdk.getCache().putActiveProfile(operation==='fetch'?alias:configuration.senderAlias);
 sdk.getCache().putXQAccess(operation==='fetch'?alias:configuration.senderAlias,operation==='fetch'?configuration.accessToken:configuration.senderAccessToken);
 let response;
 if(operation==='health')response=await new CheckApiKey(sdk).supplyAsync({'api-key':configuration.apiKey});
 else if(operation==='escrow')response=await new GeneratePacket(sdk).supplyAsync({key:share,recipients:[recipientIdentifier],expires:Math.ceil(ttlSeconds/3600),dor:true,type:XQ_DATABASE_STORAGE_TYPE,meta:receipt?{receipt}:null});
 else if(operation==='revoke')response=await new RevokeKeyAccess(sdk).supplyAsync({tokens:[locator]});
 else if(operation==='fetch')response=await new FetchKey(sdk).supplyAsync({locatorKey:locator});
 else throw new Error('Unknown XQ operation.');
 if(operation==='health'){
  const status=healthStatus;
  parentPort.postMessage({ok:true,value:{reachable:status!==undefined,authenticated:status!==undefined&&(response?.status===ServerResponse.OK),failure:status===undefined?'unreachable':(response?.status===ServerResponse.OK)?null:status===401||status===403?'authentication_refused':'provider_refused'}});
  sdk.getCache().clearAllProfiles();
 }else{
 if(response?.status!==ServerResponse.OK)throw new Error('XQ operation refused.');
 parentPort.postMessage({ok:true,value:operation==='escrow'||operation==='fetch'?response.payload:null});
 sdk.getCache().clearAllProfiles();
 }
}catch(error){parentPort.postMessage((workerData.operation==='health')?{ok:true,value:{reachable:false,authenticated:false,failure:error?.name==='TimeoutError'?'deadline_exceeded':'unreachable'}}:{ok:false,failure:failure??{kind:'operation_refused'}});}
