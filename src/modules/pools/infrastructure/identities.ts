import {readFile,lstat} from 'node:fs/promises';
import {CustodyIdentities} from '../../../shared/api/custody-identities.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {CustodyIdentitiesReader} from '../application/identities.js';
/** This path contains public associations only. Never mount an agent bundle here. */
export class FileCustodyIdentities implements CustodyIdentitiesReader {
 constructor(private readonly file=process.env.CUSTODY_IDENTITIES_FILE){}
 async list(){
  if(!this.file)return ok({items:[]});
  try{
   const info=await lstat(this.file);if(!info.isFile()||info.size>1048576)throw new Error('Invalid public manifest.');
   const data=CustodyIdentities.parse(JSON.parse(await readFile(this.file,'utf8')));if(new Set(data.items.map(i=>i.certificateId)).size!==data.items.length||new Set(data.items.map(i=>i.deviceName)).size!==data.items.length)throw new Error('Duplicate public identities.');return ok(data);
  }catch(error){
   if(error instanceof Error&&'code'in error&&error.code==='ENOENT')return ok({items:[]});
   return err(new DomainError('dependency_unavailable','Cannot read the public XQ identity manifest. Run ./identities add again or inspect its public association file.'));
  }
 }
}
