import {it,expect} from 'vitest';
import {generateKeyPairSync,publicEncrypt,constants} from 'node:crypto';
import {readdirSync,mkdtempSync,statSync,openSync,readFileSync,closeSync,rmSync,writeFileSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {unwrapDeviceToken} from '../scripts/infrastructure/xq-token-unwrap.mjs';
import {wipePrivateDirectory} from '../scripts/infrastructure/private-cleanup.mjs';
it('DEP-011: agent token unwrap succeeds and clears input on success and a failed pipe',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const bytes=privateKey.export({type:'pkcs8',format:'der'}),expected=Buffer.from('synthetic device token');
 const cipher=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},expected);
 const before=readdirSync(tmpdir()).filter(n=>n.startsWith('opintel-device-'));
 expect(await unwrapDeviceToken(bytes,cipher)).toEqual(expected);
 expect(bytes.every(v=>v===0)).toBe(true);expect(readdirSync(tmpdir()).filter(n=>n.startsWith('opintel-device-'))).toEqual(before);
 const bad=Buffer.from('not a private key');await expect(unwrapDeviceToken(bad,cipher)).rejects.toThrow();expect(bad.every(v=>v===0)).toBe(true);
});
it('Linux file path accepts ordinary disk, enforces private modes, overwrites and removes files on success and failure',async()=>{
 const parent=mkdtempSync(join(tmpdir(),'unwrap-disk-')),platform=Object.getOwnPropertyDescriptor(process,'platform');
 let fd;
 try{
  // Exercise the Linux file branch on the Mac test host too. The container
  // acceptance separately verifies actual Linux with a disk-backed /tmp.
  Object.defineProperty(process,'platform',{value:'linux',configurable:true});
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),expected=Buffer.from('fixture');
  const cipher=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},expected);
  for(const valid of [true,false]){
   const bytes=valid?privateKey.export({type:'pkcs8',format:'der'}):Buffer.from('invalid fixture key');
   const pending=unwrapDeviceToken(bytes,cipher,parent),directory=join(parent,readdirSync(parent)[0]),path=join(directory,'key');
   expect(statSync(directory).mode&0o777).toBe(0o700);expect(statSync(path).mode&0o777).toBe(0o600);
   fd=openSync(path,'r');
   if(valid)expect(await pending).toEqual(expected);else await expect(pending).rejects.toThrow('Device token unwrap failed');
   expect(bytes.every(v=>v===0)).toBe(true);expect(readFileSync(fd).every(v=>v===0)).toBe(true);
   closeSync(fd);fd=undefined;expect(readdirSync(parent)).toEqual([]);
  }
 }finally{if(fd!==undefined)closeSync(fd);Object.defineProperty(process,'platform',platform);rmSync(parent,{recursive:true,force:true});}
});
it('private directory cleanup overwrites files without following symlinks and is idempotent',()=>{
 const parent=mkdtempSync(join(tmpdir(),'wipe-fixture-')),outside=join(tmpdir(),'outside-'+parent.split('/').at(-1));let fd;
 try{
  const path=join(parent,'key');writeFileSync(path,'fixture',{mode:0o600});fd=openSync(path,'r');
  writeFileSync(outside,'keep');symlinkSync(outside,join(parent,'link'));
  wipePrivateDirectory(parent);expect(existsSync(parent)).toBe(false);expect(readFileSync(fd).equals(Buffer.alloc(7))).toBe(true);expect(readFileSync(outside,'utf8')).toBe('keep');wipePrivateDirectory(parent);
 }finally{if(fd!==undefined)closeSync(fd);rmSync(parent,{recursive:true,force:true});rmSync(outside,{force:true});}
});
