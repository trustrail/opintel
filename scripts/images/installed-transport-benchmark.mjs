import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {transportSamples,publicLatency} from './transport-benchmark.mjs';
/** Same V-01 fixture and shipped agent command for H1 and H2; no replacement client. */
export async function installedTransportBenchmark({directory,agent,verification,base,ownerCookie,env,lab,platform,run,apiLog}){
 const output=join(directory,'transport-benchmark');mkdirSync(output,{mode:0o700,recursive:true});
 const manifest=JSON.parse(readFileSync(join(verification,'output/soak.json'),'utf8')),credential=manifest.agents.find(value=>value.poolIndex===0&&value.association?.certificateId===223);assert.ok(credential,'Benchmark requires the enrolled V-01 device-223 custody agent.');
 const sql='SELECT claim_id FROM reinsurance_claims.soak_claims.claims LIMIT 1';assert.ok(Object.hasOwn(manifest.objects,'reinsurance_claims.soak_claims.claims'),'Benchmark fixture table missing');
 const key=join(output,'agent.key'),session=join(output,'owner.session'),config=join(output,'request.json');writeFileSync(key,credential.key+'\n',{mode:0o600});writeFileSync(session,ownerCookie,{mode:0o600});writeFileSync(config,JSON.stringify({operation:'benchmark-verify',base,project:manifest.projectId}),{mode:0o600});writeFileSync(join(agent,'active-identity'),'device-223\n',{mode:0o600});
 const version=JSON.parse(readFileSync('package-lock.json')).packages['node_modules/@playwright/test'].version;
 const startedAt=new Date().toISOString();let failure,verifyTimings=[];
 try{
  const verificationResult=spawnSync('docker',['run',...lab.labelArgs,'--rm','--init','--ipc=host','--platform',platform,'-v',resolve('node_modules')+':/work/node_modules:ro','-v',resolve('scripts/images/steps-custody-browser.mjs')+':/work/browser.mjs:ro','-v',session+':/input/session:ro','-v',config+':/input/request.json:ro','-v',output+':/result','-w','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs'],{encoding:'utf8',timeout:600000});
  writeFileSync(join(output,'verify.private.log'),(verificationResult.stdout??'')+(verificationResult.stderr??''),{mode:0o600});assert.ok(!verificationResult.error&&verificationResult.status===0,'Public verify benchmark failed');verifyTimings=JSON.parse(readFileSync(join(output,'result.json'),'utf8')).samples;
  for(let index=0;index<50;index++)run(join(agent,'steps'),['query','--gateway',base,'--project',manifest.projectId,'--key-file',key,'--agent-id','soak-benchmark','--sql',sql,'--quiet'],{env});
 }catch(error){failure=error;}
 const finishedAt=new Date().toISOString(),logFile=join(output,'transport.private.log');apiLog(logFile);
 const rpc=transportSamples(readFileSync(logFile,'utf8'),{startedAt,finishedAt}),publicVerify=publicLatency(verifyTimings),result={...rpc,status:failure||publicVerify.status!=='passed'?'failed':rpc.status,publicVerify,startedAt,finishedAt,fixture:'V-01 / pool0 / claims / claim_id',queryCalls:50};
 writeFileSync(join(output,'summary.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});if(failure)throw failure;assert.equal(result.status,'passed','Benchmark requires 50 successful calls on every path');return result;
}
