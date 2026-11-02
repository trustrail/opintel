// Short-lived agent-host job. Publishes public association metadata only.
import {readFile,writeFile,mkdir,rename,unlink,lstat,rmdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parse} from 'dotenv';
import {z} from 'zod';
import {CustodyIdentities} from '../../src/shared/api/custody-identities.js';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import {deviceAgent,ShareRefused} from './infrastructure/device.js';
import {privateRead} from './infrastructure/private-files.js';
const mapping=z.array(CertificateAssociation.omit({recipientIdentifier:true}).extend({bundlePath:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u)}));
async function publish(file:string,identity:CertificateAssociation){
 const directory=resolve(file,'..');await mkdir(directory,{recursive:true,mode:0o700});
 const lock=join(directory,'.publication-lock');try{await mkdir(lock,{mode:0o700});}catch{throw new Error('Another public identity import is active; retry after it completes.');}
 try{
 let data:z.infer<typeof CustodyIdentities>={items:[]};try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('Public identity file must not be a link.');data=CustodyIdentities.parse(JSON.parse(await readFile(file,'utf8')));}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
 const prior=data.items.find(i=>i.deviceName===identity.deviceName||i.certificateId===identity.certificateId);if(prior&&JSON.stringify(prior)!==JSON.stringify(identity))throw new Error('Public identity conflicts with an existing association. Nothing was overwritten.');
 if(!prior)data.items.push(identity);data.items.sort((a,b)=>a.deviceName.localeCompare(b.deviceName));
 const temporary=join(directory,'.identities-'+randomUUID());try{await writeFile(temporary,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
 }finally{await rmdir(lock);}
}
export {publish as publishPublicIdentity};
export async function exchangeIdentity(root:string,deviceName:string,apiKeyFile:string,publicFile:string){
 const entries=mapping.parse(JSON.parse(await privateRead(join(root,'certificates.json')))),entry=entries.find(i=>i.deviceName===deviceName);if(!entry)throw new Error('Imported device name not found.');
 const directory=resolve(root,entry.bundlePath);if(relative(root,directory).startsWith('..'))throw new Error('Invalid identity bundle path.');
 const text=await privateRead(apiKeyFile),apiKey=text.includes('OPINTEL_XQ_API_KEY=')?parse(text).OPINTEL_XQ_API_KEY??'':text.trim();if(!apiKey)throw new Error('XQ API key file is empty or missing OPINTEL_XQ_API_KEY.');
 const device=deviceAgent();try{
  const association=await device.exchange(entry.certificateId,entry.deviceName,directory,apiKey);
  const file=join(directory,'public-association.json'),temporary=file+'.'+randomUUID();try{await writeFile(temporary,JSON.stringify(association)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
  await publish(publicFile,association);console.info('identities add: device exchanged; public association saved. Device keys stayed on the agent host.');
 }finally{device.close();}
}
if(process.argv[1]?.endsWith('/identity-exchange.js')||process.argv[1]?.endsWith('/identity-exchange.ts')){
 const [operation,root,name,keyFile,publicFile]=process.argv.slice(2);
 void (async()=>{if(operation==='exchange'&&root&&name&&keyFile&&publicFile)return exchangeIdentity(root,name,keyFile,publicFile);if(operation==='public'&&root&&name){const data=CustodyIdentities.parse(JSON.parse(await privateRead(root)));for(const association of data.items)await publish(name,association);console.info('identities add: public associations imported; no device keys received.');return;}throw new Error('Invalid identity exchange invocation.');})().catch((error:unknown)=>{const cause=error instanceof ShareRefused?error.cause:error instanceof z.ZodError?'public identity format is invalid':error instanceof Error&&'code'in error&&['ENOENT','EACCES','EPERM'].includes(String(error.code))?'private file operation '+String(error.code):'public association import or publication failed; inspect file permissions and existing conflicts';console.error('identities add: '+cause+'. No key material was logged.');process.exitCode=1;});
}
