import {readFile,lstat} from 'node:fs/promises';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import {TextDecoder} from 'node:util';
import {z} from 'zod';
import {FileSourceSecrets,sourceName} from '../../sidecar/infrastructure/source-secrets.js';

const fields=z.strictObject({host:z.string().min(1).max(253).refine(v=>isIP(v)!==0||/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/u.test(v)),port:z.coerce.number().int().min(1).max(65535),database:z.string().min(1).max(256),user:z.string().min(1).max(256),password:z.string().max(8192)});
export function sourceUri(input:unknown):string{
 const parsed=fields.safeParse(input);if(!parsed.success)throw new Error('Invalid source '+String(parsed.error.issues[0]?.path[0]??'connection fields')+'.');
 const f=parsed.data;
 for(const value of [f.database,f.user,f.password])if(/[\p{Cc}\p{Cs}]/u.test(value))throw new Error('Connection fields must contain printable characters only.');
 const host=isIP(f.host)===6?'['+f.host+']':f.host;
 return `postgresql://${encodeURIComponent(f.user)}:${encodeURIComponent(f.password)}@${host}:${f.port}/${encodeURIComponent(f.database)}`;
}
export async function engineSources(directory:string,args:readonly string[],output:(value:string)=>void=console.info):Promise<void>{
 const store=new FileSourceSecrets(directory),[command,name,input,...extra]=args;
 if(command==='list'&&args.length===1){for(const n of await store.list())output(n);return;}
 if(!name||!sourceName.test(name))throw new Error('A valid source reference name is required.');
 if(command==='remove'&&args.length===2){await store.remove(name);return;}
 if(command!=='add'||!input||extra.length)throw new Error('Usage: sources add NAME PRIVATE_INPUT_FILE | list | remove NAME');
 const stat=await lstat(input);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>16384)throw new Error('Connection input must be a private regular file of at most 16 KiB.');
 const bytes=await readFile(input);
 try{const values=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\0');if(values.length!==6||values[5]!=='')throw new Error('Invalid private connection input.');
  const [host,port,database,user,password]=values;
  const uri=sourceUri({host,port,database,user,password});
  try{output(await store.store('sources/'+name,uri));}catch(error){if(error instanceof Error&&'code'in error&&error.code==='EEXIST')throw new Error('Source reference already exists; nothing was overwritten.');throw error;}
 }finally{bytes.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 void engineSources(process.env.ENGINE_SOURCE_SECRETS_DIRECTORY??'/package/state/sources',process.argv.slice(2)).catch((error:unknown)=>{
  const code=error instanceof Error&&'code'in error?String(error.code):null;
  console.error('Source operation failed: '+(code&&/^[A-Z][A-Z0-9_]{1,40}$/u.test(code)?code:error instanceof Error?error.message:'unexpected operator failure'));process.exitCode=1;
 });
}
