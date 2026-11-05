import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {wipePrivateDirectory} from './private-cleanup.mjs';
/** Agent-only key handling. Linux cannot reopen Node's socket-backed /dev/fd/3
 * as an OpenSSL key file. Use a mode-600 file in a mode-700 private ephemeral directory.
 * Other platforms retain the in-memory pipe. No key bytes enter argv or IPC. */
export async function unwrapDeviceToken(privateBytes,ciphertext,temporaryParent=tmpdir()){
 let directory,keyPath;
 try{
  if(process.platform==='linux'){
   directory=mkdtempSync(join(temporaryParent,'opintel-device-'));chmodSync(directory,0o700);
   keyPath=join(directory,'key');writeFileSync(keyPath,privateBytes,{mode:0o600,flag:'wx'});
  }
  return await new Promise((resolve,reject)=>{
   const child=spawn('openssl',['pkeyutl','-decrypt','-inkey',keyPath??'/dev/fd/3','-keyform',privateBytes.toString('ascii',0,20).includes('-----BEGIN')?'PEM':'DER','-pkeyopt','rsa_padding_mode:pkcs1'],{stdio:keyPath?['pipe','pipe','ignore']:['pipe','pipe','ignore','pipe'],timeout:15000});
   const chunks=[];let failed=false;const fail=()=>{failed=true;child.kill();};
   child.stdout.on('data',chunk=>chunks.push(chunk));child.stdout.on('error',fail);child.stdin.on('error',fail);child.on('error',fail);
   child.on('close',code=>{if(!failed&&code===0)resolve(Buffer.concat(chunks));else{for(const chunk of chunks)chunk.fill(0);reject(new Error('Device token unwrap failed'));}});
   if(!keyPath){child.stdio[3].on('error',fail);child.stdio[3].end(privateBytes);}
   child.stdin.end(ciphertext);
  });
 }finally{privateBytes.fill(0);if(directory)wipePrivateDirectory(directory);}
}
