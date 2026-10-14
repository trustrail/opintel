import {parentPort,workerData} from 'node:worker_threads';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

/** Operator-only SDK adapter. Exported so the SDK call can be mocked offline. */
export async function authorizeSender({apiKey,alias}){
 const require=createRequire(import.meta.url);
 const version=JSON.parse(readFileSync(require.resolve('@xqmsg/jssdk-core/package.json'),'utf8')).version;
 if(version!=='2.0.6')throw new Error('Unsupported XQ SDK version.');
 const {XQSDK,AuthorizeAlias,FetchKey,ServerResponse}=await import('@xqmsg/jssdk-core');
 const sdk=new XQSDK({XQ_API_KEY:apiKey});
 try{
  // The browser SDK transport uses XMLHttpRequest. Keep the SDK's service and
  // URL construction, supplying only a bounded native Node transport.
  sdk.makeRequest=async(url,method,_service,headers,payload,requiresApiKey)=>{
   const response=await globalThis.fetch(url,{method,headers:{...headers,'content-type':'application/json',...(requiresApiKey?{'api-key':apiKey}:{})},body:method==='GET'?undefined:JSON.stringify(payload),signal:globalThis.AbortSignal.timeout(15000),redirect:'error'});
   const text=await response.text();let value;try{value=JSON.parse(text);}catch{value=text;}
   return new ServerResponse(response.ok?ServerResponse.OK:ServerResponse.ERROR,response.status,value);
  };
  const response=await new AuthorizeAlias(sdk).supplyAsync({user:alias});
  if(response?.status!==ServerResponse.OK)throw new Error('XQ alias authorization refused.');
  const service=new FetchKey(sdk);
  return {token:response.payload,redeemUrl:`${sdk.VALIDATION_SERVER_URL.replace(/\/$/u,'')}/${service.serviceName}`};
 }finally{sdk.getCache().clearAllProfiles();}
}

if(parentPort&&workerData?.kind==='xq-bootstrap'){
 // Browser compatibility and SDK diagnostics stay in this disposable worker.
 globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
 globalThis.console.log=globalThis.console.info=globalThis.console.warn=globalThis.console.error=globalThis.console.debug=()=>{};
 try{parentPort.postMessage({ok:true,value:await authorizeSender(workerData)});}
 catch{parentPort.postMessage({ok:false});}
}
