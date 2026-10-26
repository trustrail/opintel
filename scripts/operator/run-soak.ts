import {withOperatorObserver} from '../../src/platform/ops/observer.js';
import {createRedisConnection} from '../../src/platform/redis/index.js';
import {provisionManifest,privateRead} from './common.js';
import {spawn} from 'node:child_process';
import {mkdir,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {required,privateWrite,OperatorConflict} from './common.js';
/** One-shot packaged workflow. Ordinary caller keys and decisions are preserved. */
export async function runSoak(argument:string|undefined){
 const duration=Number(argument);if(!Number.isSafeInteger(duration)||duration<1||duration>86400)throw new OperatorConflict('Usage: demo-tools run-soak DURATION_SECONDS (1–86400)');
 const directory=join(required('OPINTEL_OUTPUT_DIRECTORY'),'soak-run-'+new Date().toISOString().replaceAll(':','-'));
 await mkdir(directory,{mode:0o700});
 const steps:Array<{step:string;exitCode:number}>=[];
 let summary:unknown=null;
 const env={...process.env,OPINTEL_OBSERVER_COOKIE:process.env.OPINTEL_OBSERVER_COOKIE??'',OPINTEL_SOAK_DURATION:String(duration),OPINTEL_SOAK_OUTPUT_DIRECTORY:join(directory,'soak')};
 const execute=async()=>{for(const step of ['seed','lifecycle-renew','prepare','soak']){
  const exitCode=await new Promise<number>((resolve,reject)=>{const child=spawn(process.execPath,[process.argv[1]!,step],{env,stdio:['ignore','inherit','inherit']});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  steps.push({step,exitCode});if(exitCode!==0)break;
 }};
 if(process.env.OPINTEL_CUSTOMER_JOB==='1'){
  const redis=createRedisConnection({url:required('REDIS_URL')});await redis.connect();
  const manifest=provisionManifest.parse(JSON.parse(await privateRead(required('OPINTEL_PROVISION_MANIFEST'))));
  env.OPINTEL_OBSERVER_COOKIE=join(directory,'observer.credential');
  try{await withOperatorObserver(redis.client,{projectId:manifest.projectId,ownerEmail:required('OWNER_EMAIL'),durationSeconds:duration,file:env.OPINTEL_OBSERVER_COOKIE},execute);}finally{await redis.close();}
 }else await execute();
 try{for(const name of await readdir(env.OPINTEL_SOAK_OUTPUT_DIRECTORY)){if(!name.endsWith('.jsonl'))continue;for(const line of (await readFile(join(env.OPINTEL_SOAK_OUTPUT_DIRECTORY,name),'utf8')).trim().split('\n')){const event:unknown=JSON.parse(line);if(event&&typeof event==='object'&&'type' in event&&event.type==='summary')summary=event;}}}catch{/* Preparation failures still get a result record. */}
 const passed=steps.length===4&&steps.every(step=>step.exitCode===0)&&summary!==null;
 await privateWrite(join(directory,'result.json'),{status:passed?'passed':'failed',durationSeconds:duration,steps,summary});
 console.info('Packaged soak result: '+join(directory,'result.json'));
 if(!passed)throw new OperatorConflict('Packaged soak failed; retained result and logs identify the failing step.');
}
