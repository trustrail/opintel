// Agent process only. Never imported by gateway services.
import {Buffer} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {unwrapDeviceToken} from '../../infrastructure/xq-token-unwrap.mjs';
import {encryptCertificatePayload,decryptCertificateResponse} from '../../infrastructure/xq-device-certificate-envelope.mjs';
import {decodeXqShare} from '../../../src/shared/xq-share-codec.mjs';
import {deviceAssociation} from './device-subject.ts';
export class DeviceFailure extends Error {
 constructor(phase,status=null){super('XQ '+phase+' failed'+(status===null?'':': HTTP '+status));this.phase=phase;this.status=status;}
}
export async function xqDevice(apiKey,observe=()=>{}){
 globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
 const {XQSDK,FetchKey,ServerResponse}=await import('@xqmsg/jssdk-core');
 const endpoints=new XQSDK({XQ_API_KEY:apiKey||'missing-key'}),base=endpoints.SUBSCRIPTION_SERVER_URL.replace(/\/$/u,''),validationBase=endpoints.VALIDATION_SERVER_URL.replace(/\/$/u,'');
 if(base!=='https://subscription.xqmsg.net/v2'||validationBase!=='https://validation.xqmsg.net/v2')throw new DeviceFailure('endpoint validation');
 const identities=new Map();
 async function request(path,method,headers={},body){
  const target=path.startsWith('/')?base+path:path;
  if(!target.startsWith(base+'/')&&!target.startsWith(validationBase+'/key/'))throw new DeviceFailure('endpoint validation');
  const event={operation:target.startsWith(validationBase+'/key/')?'fetch':path,at:new Date().toISOString()};
  let response;try{response=await globalThis.fetch(target,{method,headers:{'api-key':apiKey,...headers},body,signal:globalThis.AbortSignal.timeout(15000),redirect:'error'});}catch{observe({...event,status:null});throw new DeviceFailure('connection');}
  observe({...event,status:response.status});return {status:response.status,ok:response.ok,body:await response.text()};
 }
 return {
  async exchange(certificateId,deviceName,directory){
   let phase='bundle';
   try{
    if(!apiKey)throw new DeviceFailure('API key configuration');
    const root=realpathSync(directory);if((lstatSync(root).mode&0o777)!==0o700)throw new DeviceFailure('bundle permissions');
    const contents={};for(const name of ['client.crt','client.key','transport.key']){const file=join(root,name),info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>65536||(info.mode&0o777)!==0o600)throw new DeviceFailure('bundle permissions');contents[name]=readFileSync(file,'utf8');}
    const cert=contents['client.crt'],pem=cert.includes('-----BEGIN CERTIFICATE-----')?cert:Buffer.from(cert.trim(),'base64').toString('utf8');if(!pem.startsWith('-----BEGIN CERTIFICATE-----'))throw new DeviceFailure('certificate format');
    const key=contents['client.key'],privateBytes=key.includes('-----BEGIN')?Buffer.from(key):Buffer.from(key.trim(),'base64'),transport=contents['transport.key'].trim();
    try{
     phase='server_time';const time=await request('/time','GET');if(!time.ok||!/^\d+$/u.test(time.body.trim()))throw new DeviceFailure(phase,time.status);
     phase='certificate_authorization';const response=await request('/authorize/certificate/'+certificateId,'POST',{'content-type':'application/json'},encryptCertificatePayload({crt:Buffer.from(pem).toString('base64'),device:deviceName,ver:3,ts:Number(time.body.trim())},transport));if(!response.ok)throw new DeviceFailure(phase,response.status);
     phase='response_decryption';const decoded=decryptCertificateResponse(response.body,transport);let authorization;try{authorization=JSON.parse(decoded.toString());}finally{decoded.fill(0);}
     phase='token_unwrap';const bytes=await unwrapDeviceToken(privateBytes,Buffer.from(authorization.access_token,'base64'));let token;try{token=bytes.toString().trim();}finally{bytes.fill(0);}
     const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()),association=deviceAssociation(payload,certificateId,deviceName);
     identities.set(certificateId,{token,association,expires:payload.exp});return {association,expires:payload.exp,status:response.status};
    }finally{privateBytes.fill(0);}
   }catch(error){if(error instanceof DeviceFailure)throw error;throw new DeviceFailure(phase);}
  },
  async fetchShare(certificateId,locator){
   const identity=identities.get(certificateId);if(!identity)throw new DeviceFailure('device authorization');
   const sdk=new XQSDK({XQ_API_KEY:apiKey});sdk.getCache().putActiveProfile(identity.association.recipientIdentifier);sdk.getCache().putXQAccess(identity.association.recipientIdentifier,identity.token);
   let status=null;
   try{
    sdk.makeRequest=async(url,method,_service,headers)=>{if(headers.Authorization!=='Bearer '+identity.token||!url.startsWith(validationBase+'/key/'))throw new DeviceFailure('fetch boundary');const response=await request(url,method,headers);status=response.status;let payload;try{payload=JSON.parse(response.body);}catch{payload=response.body;}return new ServerResponse(response.ok?ServerResponse.OK:ServerResponse.ERROR,response.status,payload);};
    const fetched=await new FetchKey(sdk).supplyAsync({locatorKey:locator});if(fetched.status!==ServerResponse.OK||typeof fetched.payload!=='string')throw new DeviceFailure('share retrieval',status);
    return {share:decodeXqShare(fetched.payload),status};
   }catch(error){if(error instanceof DeviceFailure)throw error;throw new DeviceFailure('share retrieval',status);}finally{sdk.getCache().clearAllProfiles();}
  },
  clear(){identities.clear();}
 };
}
