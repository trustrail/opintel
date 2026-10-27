import {readFile,mkdir,writeFile,rename,rm,lstat,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {X509Certificate,createPrivateKey,timingSafeEqual,randomUUID} from 'node:crypto';
import {fromBuffer,type Entry} from 'yauzl';
import {z} from 'zod';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
const deviceMapping=CertificateAssociation.omit({recipientIdentifier:true}).extend({bundlePath:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u)});

const names=['client.crt','client.key','transport.key'] as const;
async function exportFiles(file:string):Promise<Map<string,Buffer>>{
 const info=await lstat(file);if(!info.isFile()||info.size>1048576)throw new Error('XQ export must be a ZIP file of at most 1 MiB.');
 const bytes=await readFile(file);
 return new Promise((resolve,reject)=>fromBuffer(bytes,{lazyEntries:true},(error,zip)=>{
  if(error||!zip){reject(new Error('Cannot read XQ export ZIP.'));return;}
  const files=new Map<string,Buffer>();let failed=false;
  const fail=()=>{if(failed)return;failed=true;zip.close();for(const value of files.values())value.fill(0);reject(new Error('XQ export must contain exactly client.crt, client.key and transport.key, with no links, duplicate or oversized entries.'));};
  zip.on('error',fail);zip.on('end',()=>{if(!failed){if(files.size!==3)fail();else resolve(files);}});
  zip.on('entry',(entry:Entry)=>{
   const type=(entry.externalFileAttributes>>>16)&0o170000;
   if(!names.some(name=>name===entry.fileName)||files.has(entry.fileName)||entry.uncompressedSize<1||entry.uncompressedSize>65536||(type!==0&&type!==0o100000)){fail();return;}
   zip.openReadStream(entry,(streamError,stream)=>{
    if(streamError||!stream){fail();return;}
    const chunks:Buffer[]=[];let size=0;
    stream.on('error',fail);stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536){stream.destroy();fail();}else chunks.push(chunk);});
    stream.on('end',()=>{if(failed)return;files.set(entry.fileName,Buffer.concat(chunks));for(const chunk of chunks)chunk.fill(0);zip.readEntry();});
   });
  });zip.readEntry();
 }));
}
/** Host-only import of existing licensed identities. No identity creation or network calls. */
export async function importIdentity(root:string,archive:string,originalName:string,device?:string):Promise<void>{
 const match=/-([1-9][0-9]*)\.zip$/iu.exec(originalName);
 if(!match)throw new Error('Use the original XQ export filename ending in -CERTIFICATE_ID.zip.');
 const certificateId=z.number().int().positive().max(2147483647).parse(Number(match[1]));
 const deviceName=device??'opintel-'+certificateId;
 const item=deviceMapping.parse({certificateId,deviceName,bundlePath:'device-'+certificateId});
 const files=await exportFiles(archive);
 const directory=join(root,'identity-bundles'),lock=join(directory,'.import-lock'),temporary=join(directory,'.import-'+randomUUID());let locked=false,temporaryCreated=false;
 try{
  const certificateText=files.get('client.crt')!.toString('utf8');
  const certificate=new X509Certificate(certificateText.includes('-----BEGIN')?certificateText:Buffer.from(certificateText.trim(),'base64'));
  const keyText=files.get('client.key')!.toString('utf8');
  const keyBytes=keyText.includes('-----BEGIN')?Buffer.from(keyText):Buffer.from(keyText.trim(),'base64');
  try{const key=keyBytes.includes(Buffer.from('-----BEGIN'))?createPrivateKey(keyBytes):createPrivateKey({key:keyBytes,format:'der',type:'pkcs8'});if(!certificate.checkPrivateKey(key))throw new Error('XQ export certificate and private key do not match.');}finally{keyBytes.fill(0);}
  if(!files.get('transport.key')!.toString('utf8').trim())throw new Error('XQ export transport key is empty.');
  await mkdir(directory,{recursive:true,mode:0o700});if(!(await lstat(directory)).isDirectory()||(await lstat(directory)).isSymbolicLink())throw new Error('Identities must be a private directory, not a link.');await chmod(directory,0o700);
  try{await mkdir(lock,{mode:0o700});locked=true;}catch{throw new Error('Another identity import is active or interrupted; inspect identity-bundles/.import-lock.');}
  const manifest=join(directory,'certificates.json');let entries:z.infer<typeof deviceMapping>[]=[];
  try{entries=z.array(deviceMapping).parse(JSON.parse(await readFile(manifest,'utf8')));}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
  const existing=entries.find(entry=>entry.certificateId===certificateId||entry.deviceName===deviceName);
  if(existing){
   if(existing.certificateId!==item.certificateId||existing.deviceName!==item.deviceName)throw new Error('Identity conflicts with the existing manifest; nothing was overwritten.');
   for(const name of names){const saved=await readFile(join(directory,existing.bundlePath,name)),incoming=files.get(name)!;try{if(saved.length!==incoming.length||!timingSafeEqual(saved,incoming))throw new Error('Identity conflicts with the existing bundle; nothing was overwritten.');}finally{saved.fill(0);}}
   console.info('Identity already imported; unchanged.');return;
  }
  await mkdir(temporary,{mode:0o700});temporaryCreated=true;for(const name of names)await writeFile(join(temporary,name),files.get(name)!,{mode:0o600,flag:'wx'});
  const destination=join(directory,item.bundlePath);
  try{await lstat(destination);throw new Error('Identity directory already exists outside the manifest; inspect it before importing.');}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
  await rename(temporary,destination);
  const next=join(directory,'.manifest-'+randomUUID());await writeFile(next,JSON.stringify([...entries,item],null,2)+'\n',{mode:0o600,flag:'wx'});await rename(next,manifest);
  console.info('Team-issued identity imported. Manifest: identity-bundles/certificates.json');
 }finally{for(const value of files.values())value.fill(0);if(temporaryCreated)await rm(temporary,{recursive:true,force:true});if(locked)await rm(lock,{recursive:true});}
}
