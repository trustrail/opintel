import {Buffer} from 'node:buffer';
import {createCipheriv,createDecipheriv,pbkdf2Sync,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Operator probe only: XQ's supplied device-certificate tutorial contract.
// The transport key is the trimmed text, never its base64-decoded bytes.
const header=Buffer.from('Salted__','ascii');
function derive(transportKey,salt){
 if(typeof transportKey!=='string'||!transportKey.trim())throw new Error('Missing transport key.');
 return pbkdf2Sync(transportKey.trim(),salt,1024,32,'sha256');
}
export function encryptCertificatePayload(payload,transportKey){
 const salt=randomBytes(16),iv=randomBytes(12),key=derive(transportKey,salt);
 try{
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return Buffer.concat([header,salt,iv,ciphertext,cipher.getAuthTag()]).toString('base64');
 }finally{key.fill(0);}
}
export function decryptCertificateResponse(encoded,transportKey){
 const envelope=Buffer.from(encoded.trim(),'base64');
 if(envelope.length<52||!envelope.subarray(0,8).equals(header))throw new Error('Invalid certificate response envelope.');
 // Response owns its salt and IV; do not reuse request parameters.
 const salt=envelope.subarray(8,24),iv=envelope.subarray(24,36),tag=envelope.subarray(-16);
 const key=derive(transportKey,salt);
 try{
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(envelope.subarray(36,-16)),decipher.final()]);
 }finally{key.fill(0);}
}
export function decryptDeviceAccessToken(ciphertext,privateKeyPath){
 // This Node runtime disables privateDecrypt's PKCS#1 v1.5 mode. Use the
 // installed OpenSSL primitive explicitly, without weakening Node settings.
 const result=spawnSync('openssl',['pkeyutl','-decrypt','-inkey',privateKeyPath,'-keyform','DER','-pkeyopt','rsa_padding_mode:pkcs1'],{input:ciphertext,timeout:15000,maxBuffer:1048576});
 if(result.status!==0||!result.stdout.length)throw new Error('RSA device-token decryption failed.');
 return result.stdout;
}
