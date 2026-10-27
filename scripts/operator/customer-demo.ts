import {mkdir} from 'node:fs/promises';
import {withOperatorObserver} from '../../src/platform/ops/observer.js';
import {createRedisConnection} from '../../src/platform/redis/index.js';
import {prepare} from './prepare.js';
import {join,resolve,relative} from 'node:path';
import {z} from 'zod';
import {withPlatform} from '../../src/platform/db/scope.js';
import {ReleaseRuntime} from '../../src/modules/release-custody/index.js';
import {certificateMapping} from '../soak/manifest.js';
import {context,privateRead,privateWrite,required,OperatorConflict,provisionManifest} from './common.js';
import {provision} from './provision-service.js';
import {runSoak} from './run-soak.js';
async function matching(file:string,value:unknown){
 try{const saved:unknown=JSON.parse(await privateRead(file));if(JSON.stringify(saved)!==JSON.stringify(value))throw new OperatorConflict('Existing demo configuration differs; no identity, credential or decision was overwritten.');}
 catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;await privateWrite(file,value);}
}
export async function customerSoak(duration:string|undefined){
 if(process.env.OPINTEL_CUSTOMER_JOB!=='1')throw new OperatorConflict('Use the installed gateway ./demo command.');
 const seconds=Number(duration);if(!Number.isSafeInteger(seconds)||seconds<1||seconds>86400)throw new OperatorConflict('Usage: ./demo soak DURATION_SECONDS');
 const ownerEmail=required('OWNER_EMAIL');
 const users=await withPlatform(tx=>tx.query<{company_id:string}>("SELECT m.company_id FROM company_member m JOIN user_account u ON u.id=m.user_id WHERE u.email=$1 AND m.role='admin' AND u.last_login_at IS NOT NULL",[ownerEmail]));
 if(users.length!==1)throw new OperatorConflict('Complete normal owner email login before running the demo.');
 let peerText:string;try{peerText=await privateRead(join(required('OPINTEL_OUTPUT_DIRECTORY'),'peer.json'));}catch(error){if(error instanceof Error&&'code'in error&&error.code==='ENOENT')throw new OperatorConflict('No engine registered. Run ./register-engine ENGINE_ADDRESS CODE first.');throw error;}
 const peer=z.object({address:z.url(),pin:z.string()}).parse(JSON.parse(peerText));
 const root='/home/operator/.xq';
 const mapping=certificateMapping.parse(JSON.parse(await privateRead(join(root,'certificates.json')))).map(item=>{
  const path=resolve(root,item.bundlePath);if(item.bundlePath.startsWith('/')||relative(root,path).startsWith('..'))throw new OperatorConflict('Device bundle paths must be relative to identities.');return {...item,bundlePath:path};
 });
 await matching(required('OPINTEL_CERTIFICATES'),mapping);
 await matching(required('OPINTEL_OPERATOR_CONFIG'),{ownerEmail,companyId:users[0]!.company_id,projectName:'Reinsurance demonstration',region:'us-east-1',engine:{name:'Customer engine',address:peer.address,certificatePin:peer.pin.replaceAll(':','')},sourceCredentialRef:'secret://install/readiness',settings:{query:{rowLimit:1000,timeoutSeconds:30,memoryLimitMb:256,concurrencyPerPool:2,aggregateMinGroupSize:5},custody:{provider:'xq',tenant:required('OPINTEL_XQ_TEAM_ID'),region:'us-east-1'},poolKeyGraceSeconds:3600}});
 await provision();
 const manifest=provisionManifest.parse(JSON.parse(await privateRead(required('OPINTEL_PROVISION_MANIFEST')))),c=await context(),runtime=new ReleaseRuntime();
 try{const check=await runtime.checkConnection({projectId:manifest.projectId,userId:c.userId});if(!check.reachable||!check.authenticated||check.failure)throw new OperatorConflict('XQ connection check failed; demo was not started.');}
 finally{runtime.close();c.auth.close();}
 await runSoak(duration);
}

/** Standalone preparation is the receipt-verifying phase of the same soak job. */
export async function customerPrepare(){
 const directory=join(required('OPINTEL_OUTPUT_DIRECTORY'),'prepare-run-'+new Date().toISOString().replaceAll(':','-'));
 await mkdir(directory,{mode:0o700});
 const manifest=provisionManifest.parse(JSON.parse(await privateRead(required('OPINTEL_PROVISION_MANIFEST'))));
 const redis=createRedisConnection({url:required('REDIS_URL')});await redis.connect();
 const file=join(directory,'observer.credential'),previous=process.env.OPINTEL_OBSERVER_COOKIE;
 process.env.OPINTEL_OBSERVER_COOKIE=file;
 try{await withOperatorObserver(redis.client,{projectId:manifest.projectId,ownerEmail:required('OWNER_EMAIL'),durationSeconds:Number(required('OPINTEL_SOAK_DURATION')),file},prepare);}
 finally{if(previous===undefined)delete process.env.OPINTEL_OBSERVER_COOKIE;else process.env.OPINTEL_OBSERVER_COOKIE=previous;await redis.close();}
}
