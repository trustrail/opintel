import {createHash} from 'node:crypto';
import {z} from 'zod';
import {privateRead} from '../../../operator/private-input.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {syntheticSource} from '../../../operator/infrastructure/synthetic-source.js';
const exec=promisify(execFile);
export async function customerSource(engineDirectory:string,targetFile:string,name:string,output:string,sourceHost?:string){
 if(!/^[A-Za-z0-9_-]+$/u.test(name))throw new Error('Invalid engine source reference name');
 const target=(await privateRead(targetFile)).trim();
 await syntheticSource(true,{target,fixture:'V-01',seed:1,schemas:['soak_policies','soak_claims','soak_recoveries']});
 const ownershipFile=join(output,'source-registration.json'),identity={name,targetHash:createHash('sha256').update(target+'\n'+(sourceHost??'')).digest('hex')};
 const program=resolve(engineDirectory,'sources'),listed=await exec(program,['list'],{timeout:120000,maxBuffer:65536});
 if(listed.stdout.trim().split(/\s+/u).includes(name)){const saved=z.object({name:z.string(),targetHash:z.string()}).parse(JSON.parse(await privateRead(ownershipFile)));if(saved.name!==identity.name||saved.targetHash!==identity.targetHash)throw new Error('Source reference ownership conflict');return 'secret://sources/'+name;}
 const uri=new URL(target),passwordFile=join(output,'source-password.input');await writeFile(passwordFile,decodeURIComponent(uri.password),{mode:0o600,flag:'wx'});
 try{const r=await exec(program,['add',name,'--host',sourceHost??uri.hostname,'--port',uri.port||'5432','--database',decodeURIComponent(uri.pathname.slice(1)),'--user',decodeURIComponent(uri.username),'--password-file',passwordFile],{timeout:120000,maxBuffer:65536});if(r.stdout.trim()!=='secret://sources/'+name)throw new Error('Engine sources add did not return the named reference');await writeFile(ownershipFile,JSON.stringify(identity),{mode:0o600,flag:'wx'});return r.stdout.trim();}
 finally{await unlink(passwordFile);}
}
