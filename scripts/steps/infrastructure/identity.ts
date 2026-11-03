import {deviceAgent} from './device.js';
import {parse} from 'dotenv';
import {createPrivateKey,X509Certificate} from 'node:crypto';
import {join} from 'node:path';
import {IdentityEnrollment} from '../../../src/shared/api/credential-identity.js';
import {privateRead} from './private-files.js';
export async function clientIdentity(directory:string,enrollment?:IdentityEnrollment){
 const text=await privateRead(join(directory,'client.crt')),certificate=text.includes('-----BEGIN')?text:Buffer.from(text.trim(),'base64').toString('utf8');
 const keyText=await privateRead(join(directory,'client.key')),bytes=keyText.includes('-----BEGIN')?Buffer.from(keyText):Buffer.from(keyText.trim(),'base64');
 try{
  const key=createPrivateKey(bytes.includes(Buffer.from('-----BEGIN'))?bytes:{key:bytes,format:'der',type:'pkcs8'});
  if(!new X509Certificate(certificate).checkPrivateKey(key))throw new Error('The identity certificate and private key do not match.');
  return {certificate,key:key.export({format:'pem',type:'pkcs8'}),enrollment:IdentityEnrollment.parse(enrollment??JSON.parse(await privateRead(join(directory,'public-association.json'))))};
 }finally{bytes.fill(0);}
}

/** One short-lived agent process proves XQ access during enrollment only. */
export async function enrollmentIdentity(directory:string,apiKeyFile:string|undefined,enrollment?:IdentityEnrollment){
 const identity=await clientIdentity(directory,enrollment);
 return {...identity,proveEnrollment:async(locator:string)=>{
  if(!apiKeyFile)throw new Error('Identity enrollment: configure a private XQ API key file on the agent host.');
  const text=await privateRead(apiKeyFile),apiKey=text.includes('OPINTEL_XQ_API_KEY=')?parse(text).OPINTEL_XQ_API_KEY??'':text.trim();
  const device=deviceAgent();try{
   const observed=await device.exchange(identity.enrollment.certificateId,identity.enrollment.deviceName,directory,apiKey);
   if(observed.recipientIdentifier!==identity.enrollment.recipientIdentifier)throw new Error('Identity enrollment: XQ recipient changed; nothing was bound.');
   return await device.share(observed.certificateId,locator);
  }finally{device.close();}
 }};
}
