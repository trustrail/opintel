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
 const {XQSDK,GeneratePacket,RevokeKeyAccess,FetchKey,CheckApiKey,GetCurrentBusiness,ServerResponse}=await import('@xqmsg/jssdk-core');
 const {configuration,operation,alias,recipientIdentifier,locator,share,ttlSeconds,receipt}=workerData;
 const sdk=new XQSDK({XQ_API_KEY:configuration.apiKey,DASHBOARD_API_KEY:configuration.dashboardApiKey});
 // Explicit infrastructure injection for local adapter contract tests; never
 // exposed through Settings or agent input.
 if(configuration.dashboardUrl)sdk.DASHBOARD_SERVER_URL=configuration.dashboardUrl;
 if(configuration.subscriptionUrl)sdk.SUBSCRIPTION_SERVER_URL=configuration.subscriptionUrl;
 if(configuration.validationUrl)sdk.VALIDATION_SERVER_URL=configuration.validationUrl;
 let healthStatus;
 // Native fetch transport avoids XMLHttpRequest and shares no response cache.
 sdk.makeRequest=async(url,method,service,headers,payload,requiresApiKey)=>{
  const requestHeaders={...headers};if(requiresApiKey)requestHeaders['api-key']=operation==='dashboard_health'?configuration.dashboardApiKey:configuration.apiKey;
  const plain=requestHeaders['content-type']==='text/plain;charset=UTF-8';if(!plain)requestHeaders['content-type']='application/json';
  const signal=globalThis.AbortSignal.timeout(15000);let response;
  try{response=await globalThis.fetch(url,{method,headers:requestHeaders,body:method==='GET'?undefined:plain?payload?.data:JSON.stringify(payload),signal,redirect:'error'});}catch(error){failure={kind:signal.aborted?'deadline_exceeded':'unreachable'};throw error;}
  if(!response.ok)failure={kind:'http_refused',status:response.status};
  if(operation==='health'||operation==='dashboard_health'){healthStatus=response.status;await response.body?.cancel();return new ServerResponse(response.ok?ServerResponse.OK:ServerResponse.ERROR,response.status,null);}
  let text;try{text=await response.text();}catch(error){failure??={kind:signal.aborted?'deadline_exceeded':'unreachable'};throw error;}let value;try{value=JSON.parse(text);}catch{value=text;}
  return new ServerResponse(response.ok?ServerResponse.OK:ServerResponse.ERROR,response.status,value);
 };
 sdk.getCache().putActiveProfile(operation==='fetch'?alias:configuration.senderAlias);
 sdk.getCache().putXQAccess(operation==='fetch'?alias:configuration.senderAlias,operation==='fetch'?configuration.accessToken:configuration.senderAccessToken);
 let response;
 if(operation==='dashboard_health'){sdk.getCache().putDashboardAccess(configuration.senderAlias,configuration.dashboardAccessToken);response=await new GetCurrentBusiness(sdk).supplyAsync(null);}
 else if(operation==='health')response=await new CheckApiKey(sdk).supplyAsync({'api-key':configuration.apiKey});
 else if(operation==='escrow')response=await new GeneratePacket(sdk).supplyAsync({key:share,recipients:[recipientIdentifier],expires:Math.ceil(ttlSeconds/3600),dor:true,type:XQ_DATABASE_STORAGE_TYPE,meta:receipt?{receipt}:null});
 else if(operation==='revoke')response=await new RevokeKeyAccess(sdk).supplyAsync({tokens:[locator]});
 else if(operation==='fetch')response=await new FetchKey(sdk).supplyAsync({locatorKey:locator});
 else throw new Error('Unknown XQ operation.');
 if(operation==='health'||operation==='dashboard_health'){
  const status=healthStatus;
  parentPort.postMessage({ok:true,value:{reachable:status!==undefined,authenticated:status!==undefined&&(operation==='dashboard_health'?status>=200&&status<300:response?.status===ServerResponse.OK),failure:status===undefined?'unreachable':(operation==='dashboard_health'?status>=200&&status<300:response?.status===ServerResponse.OK)?null:status===401||status===403?'authentication_refused':'provider_refused'}});
  sdk.getCache().clearAllProfiles();
 }else{
 if(response?.status!==ServerResponse.OK)throw new Error('XQ operation refused.');
 parentPort.postMessage({ok:true,value:operation==='escrow'||operation==='fetch'?response.payload:null});
 sdk.getCache().clearAllProfiles();
 }
}catch(error){parentPort.postMessage((workerData.operation==='health'||workerData.operation==='dashboard_health')?{ok:true,value:{reachable:false,authenticated:false,failure:error?.name==='TimeoutError'?'deadline_exceeded':'unreachable'}}:{ok:false,failure:failure??{kind:'operation_refused'}});}
