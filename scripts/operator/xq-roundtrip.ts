import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {join,resolve,relative} from 'node:path';
import {z} from 'zod';
import {XqReleaseProvider,type ReleaseProvider} from '../../src/modules/release-custody/index.js';
import {custodyProviderFailure} from '../../src/shared/custody-failure.js';
import {xqShareEncoding} from '../../src/shared/xq-share-codec.mjs';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import {custodyAgents} from '../soak/custody.js';
import {certificateMapping} from '../soak/manifest.js';
import {required,privateRead,privateWrite,OperatorConflict} from './common.js';

type Association=z.infer<typeof CertificateAssociation>;
type Verifier=(association:Association,locator:string,expectedDigest:string)=>Promise<{ok:boolean;status:number|null}>;
/** Digests are IPC-only comparisons; neither digests, shares nor locators enter the report. */
export async function checkXqRoundTrips(provider:Pick<ReleaseProvider,'escrow'|'revoke'>,associations:readonly Association[],verify:Verifier){
 if(!associations.length)throw new OperatorConflict('No certificate exchange succeeded.');
 const attempts:Array<{id:string;certificateId:number;startedAt:string;completedAt:string;verified:boolean;fetchStatus:number|null;failurePhase:'escrow'|'fetch'|'verify'|null;failure:z.infer<typeof custodyProviderFailure>|null;cleanupFailed:boolean}>=[];
 for(let index=0;index<200;index++){
  const association=associations[index%associations.length]!,share=randomBytes(32),id=randomUUID(),startedAt=new Date().toISOString();
  let failurePhase:'escrow'|'fetch'|'verify'|null='escrow';
  let locator:string|undefined,verified=false,fetchStatus:number|null=null,failure:z.infer<typeof custodyProviderFailure>|null=null,cleanupFailed=false;
  try{
   const digest=createHash('sha256').update(share).digest('hex');
   locator=await provider.escrow(share,association.recipientIdentifier,3600,true,id);failurePhase='fetch';
   const result=await verify(association,locator,digest);verified=result.ok&&result.status===200;fetchStatus=result.status;failurePhase=verified?null:result.status===200?'verify':'fetch';
  }catch(error){const diagnostic=z.object({failure:custodyProviderFailure}).safeParse(error);failure=diagnostic.success?diagnostic.data.failure:null;}
  finally{share.fill(0);if(locator&&!verified){try{await provider.revoke(locator);}catch{cleanupFailed=true;}}}
  attempts.push({id,certificateId:association.certificateId,startedAt,completedAt:new Date().toISOString(),verified,fetchStatus,failurePhase,failure,cleanupFailed});
 }
 const verified=attempts.filter(attempt=>attempt.verified&&!attempt.cleanupFailed).length;
 return {status:verified===200?'passed' as const:'failed' as const,keyEncoding:xqShareEncoding,required:200,attempted:attempts.length,verified,attempts};
}

export async function xqRoundTripCheck(count:string|undefined){
 if(process.env.OPINTEL_CUSTOMER_JOB!=='1'||count!=='200')throw new OperatorConflict('Usage: ./xq-check --roundtrips 200');
 const directory=join(required('OPINTEL_OUTPUT_DIRECTORY'),'xq-roundtrip-'+new Date().toISOString().replaceAll(':','-'));
 const root='/home/operator/.xq',mapping=certificateMapping.parse(JSON.parse(await privateRead(join(root,'certificates.json')))).map(entry=>{
  const path=resolve(root,entry.bundlePath);if(entry.bundlePath.startsWith('/')||relative(root,path).startsWith('..'))throw new OperatorConflict('Device bundle paths must remain inside identity-bundles.');return {...entry,bundlePath:path};
 });
 const mappingFile=join(directory,'certificates.json');await privateWrite(mappingFile,mapping);
 const provider=new XqReleaseProvider({apiKey:required('OPINTEL_XQ_API_KEY'),dashboardApiKey:required('OPINTEL_XQ_DASHBOARD_API_KEY'),senderAlias:required('OPINTEL_XQ_SENDER_ALIAS'),senderAccessToken:required('OPINTEL_XQ_SENDER_ACCESS_TOKEN')},required('OPINTEL_XQ_TEAM_ID'),required('OPINTEL_XQ_REDEEM_URL'));
 const exchanges:Array<{certificateId:number;ok:boolean;status:number|null}>=[];
 const agents=custodyAgents(mappingFile,required('OPINTEL_XQ_API_KEY'),()=>{},state=>{exchanges.push({certificateId:state.certificateId,ok:state.ok,status:state.status});});
 try{
  const associations=await agents.associations();
  if(associations.length!==mapping.length)throw new OperatorConflict('XQ check requires every configured certificate exchange to succeed.');
  const result=await checkXqRoundTrips(provider,associations,(association,locator,digest)=>agents.verifyShare(association,locator,digest));
  await privateWrite(join(directory,'result.json'),{...result,exchanges});
  console.info('XQ escrow/redeem verification: '+result.verified+'/200. Private result: '+join(directory,'result.json'));
  if(result.status!=='passed')throw new OperatorConflict('XQ escrow/redeem check failed; all 200 must verify.');
 }finally{await agents.close();}
}
