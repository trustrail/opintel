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
