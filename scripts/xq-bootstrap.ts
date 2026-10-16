import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {parse} from 'dotenv';
import {z} from 'zod';

const input=z.object({OPINTEL_XQ_API_KEY:z.string().trim().min(1),OPINTEL_XQ_SENDER_ALIAS:z.string().trim().min(1)});
const result=z.strictObject({token:z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),redeemUrl:z.url().refine(value=>new URL(value).protocol==='https:'&&!/[\s"'`$\\#]/u.test(value))});
type Sender={apiKey:string;alias:string};
type Authorize=(sender:Sender)=>Promise<unknown>;
const failure='XQ bootstrap failed. Check the .env API key and sender alias, provider availability, and token expiry. No credentials were printed.';

export function authorizeWithWorker(sender:Sender):Promise<unknown>{return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./infrastructure/xq-bootstrap-worker.mjs',import.meta.url),{workerData:{kind:'xq-bootstrap',...sender},stdout:true,stderr:true});
 // SDK diagnostics (including error bodies) must never reach the terminal.
 worker.stdout.resume();worker.stderr.resume();
 let settled=false;
 const finish=(value:unknown,failed:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();if(failed)reject(new Error(failure));else resolve(value);};
 const timer=setTimeout(()=>finish(undefined,true),20000);
 worker.once('message',(message:unknown)=>{const parsed=z.discriminatedUnion('ok',[z.object({ok:z.literal(true),value:z.unknown()}),z.object({ok:z.literal(false)})]).safeParse(message);if(!parsed.success||!parsed.data.ok)finish(undefined,true);else finish(parsed.data.value,false);});
 worker.once('error',()=>finish(undefined,true));worker.once('exit',()=>finish(undefined,true));
});}

/** Returns the sole output containing the token; never persists configuration. */
export async function bootstrap(envFile:string,authorize:Authorize=authorizeWithWorker,now=Date.now()):Promise<string>{
 try{
  if(process.env.NODE_ENV==='production')throw new Error('Development only.');
  const env=input.parse(parse(envFile));
  const value=result.parse(await authorize({apiKey:env.OPINTEL_XQ_API_KEY,alias:env.OPINTEL_XQ_SENDER_ALIAS}));
  const payload:unknown=JSON.parse(Buffer.from(value.token.split('.')[1]!,'base64url').toString('utf8'));
  const {exp}=z.object({exp:z.number().int().positive()}).parse(payload);
  const expiresAt=new Date(exp*1000);if(expiresAt.getTime()<=now||!Number.isFinite(expiresAt.getTime()))throw new Error('Invalid expiry.');
  return `OPINTEL_XQ_SENDER_ACCESS_TOKEN=${value.token}\nOPINTEL_XQ_REDEEM_URL=${value.redeemUrl}\n# Sender token expires at ${expiresAt.toISOString()} (JWT exp; signature not verified locally).\n`;
 }catch{throw new Error(failure);}
}

export async function main(){
 try{const output=await bootstrap(await readFile(new URL('../.env',import.meta.url),'utf8'));process.stdout.write(output);}
 catch{process.stderr.write(failure+'\n');process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();
