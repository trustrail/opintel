import {constants} from 'node:fs';
import {mkdir,lstat,open,readdir,unlink,link} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {DomainError} from '../../src/shared/kernel/index.js';
import {EnvironmentSecretStore,SecretRef,decodeSecretBytes,type SecretStorePort} from '../../src/platform/secrets/index.js';

export const sourceName=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const failure=(message:string)=>new DomainError('dependency_unavailable',message,{cause:'component_configuration',reason:'source_secret_store'},false);
function nameOf(path:string):string{
 const name=path.replace(/^secret:\/\//u,'').replace(/^sources\//u,'');
 if(!sourceName.test(name))throw failure('Use a source name of 1–64 letters, digits, underscores or hyphens.');
 return name;
}
/** Engine-local only. The gateway never constructs this adapter or mounts it. */
export class FileSourceSecrets implements SecretStorePort{
 constructor(private readonly directory:string,private readonly fallback:SecretStorePort=new EnvironmentSecretStore()){}
 private async directoryInfo(create=false){
  if(create)await mkdir(this.directory,{mode:0o700,recursive:true});
  const info=await lstat(this.directory);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o777)!==0o700)throw failure('Source secret directory must be a private mode-700 directory.');
 }
 async resolve(ref:SecretRef):Promise<string>{
  if(!ref.startsWith('secret://sources/'))return this.fallback.resolve(ref);
  const name=nameOf(ref);await this.directoryInfo();
  const file=await open(join(this.directory,name),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const info=await file.stat();
   if(!info.isFile()||(info.mode&0o777)!==0o600||info.size>16384)throw failure('Source secret must be a private mode-600 regular file.');
   return await file.readFile('utf8');
  }finally{await file.close();}
 }
 async resolveBytes(ref:SecretRef){return decodeSecretBytes(ref,await this.resolve(ref));}
 async store(path:string,secret:string):Promise<SecretRef>{
  const name=nameOf(path);if(Buffer.byteLength(secret)>16384)throw failure('Source credential is too large.');
  await this.directoryInfo(true);
  const temporary=join(this.directory,'.source-'+randomUUID());
  const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{try{await file.chmod(0o600);await file.writeFile(secret);await file.sync();}finally{await file.close();}await link(temporary,join(this.directory,name));}
  finally{await unlink(temporary);}
  return SecretRef('secret://sources/'+name);
 }
 async list():Promise<string[]>{await this.directoryInfo(true);const names=(await readdir(this.directory)).filter(name=>!/^\.source-[0-9a-f-]{36}$/u.test(name)).sort();
  for(const name of names){if(!sourceName.test(name))throw failure('Unexpected entry in source secret directory.');await this.resolve(SecretRef('secret://sources/'+name));}
  return names;
 }
 async remove(name:string):Promise<void>{const ref=SecretRef('secret://sources/'+nameOf(name));await this.resolve(ref);await unlink(join(this.directory,nameOf(name)));}
}
export function engineSecretStore(){return new FileSourceSecrets(process.env.ENGINE_SOURCE_SECRETS_DIRECTORY??'/source-secrets');}
