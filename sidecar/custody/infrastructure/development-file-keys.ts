import { mkdir, realpath, open, rename, unlink, lstat, link } from 'node:fs/promises';
import { join } from 'node:path';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { VaultRef, decodeVaultBytes } from '../../../src/platform/vault/index.js';
import type { KeyStore } from '../ports.js';
/** Development only: two local directories do NOT provide independent disaster custody. */
export class DevelopmentFileKeyStore implements KeyStore {
 protected constructor(readonly location:string){}
 static async open(directory:string){await mkdir(directory,{recursive:true,mode:0o700});return new this(await realpath(directory));}
 private path(name:string){if(!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$(?![\s\S])/u.test(name))throw new Error('Invalid custody storage name.');return join(this.location,name);}
 async write(name:string,hex:string,replace=false){
  const bytes=decodeVaultBytes(VaultRef('vault://custody/'+name),hex);bytes.fill(0);
  const path=this.path(name);await mkdir(join(path,'..'),{recursive:true,mode:0o700});
  const target=path+'.'+randomUUID();
  const file=await open(target,'wx',0o600);
  try{await file.writeFile(hex,'utf8');await file.sync();}finally{await file.close();}
  if(replace)await rename(target,path);else{try{await link(target,path);}finally{await unlink(target);}}
  const dir=await open(join(path,'..'),'r');try{await dir.sync();}finally{await dir.close();}
 }
 async resolve(ref:VaultRef){const name=ref.slice('vault://custody/'.length);if(!ref.startsWith('vault://custody/'))throw new Error('Invalid custody reference.');const f=await open(this.path(name),constants.O_RDONLY|constants.O_NOFOLLOW);try{return await f.readFile('utf8');}finally{await f.close();}}
 async resolveBytes(ref:VaultRef){return decodeVaultBytes(ref,await this.resolve(ref));}
 async store(path:string,secret:string){await this.write(path,secret);return VaultRef('vault://custody/'+path);}
 async exists(name:string){try{const stat=await lstat(this.path(name));return stat.isFile()&&!stat.isSymbolicLink();}catch(error){if((error as {code?:string}).code==='ENOENT')return false;throw error;}}
 async discardUncommitted(name:string){if(!/\/v[0-9]+$/u.test(name))throw new Error('Invalid uncommitted version.');await unlink(this.path(name)).catch(error=>{if((error as {code?:string}).code!=='ENOENT')throw error;});}
 async removeCandidate(name:string){if(!name.includes('/candidate-'))throw new Error('Retained key versions cannot be deleted.');await unlink(this.path(name)).catch(error=>{if((error as {code?:string}).code!=='ENOENT')throw error;});}
}
export class DevelopmentFileKeyEscrow extends DevelopmentFileKeyStore {}
