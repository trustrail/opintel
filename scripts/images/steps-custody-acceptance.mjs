import {companionCustodyAcceptance,prepareCompanionImage} from './companion-custody-acceptance.mjs';
import process from 'node:process';
import {Buffer} from 'node:buffer';
const {fetch}=globalThis;
// Extension of the standard archive acceptance harness, not a replacement login,
// MCP or TLS implementation. All agent actions run the shipped ./steps command.
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,chmodSync,existsSync,statSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {homedir} from 'node:os';
import {setTimeout} from 'node:timers/promises';
import assert from 'node:assert/strict';
/** Stage private inputs inside the path shared with the nested Docker daemon. */
export function stageAgentIdentityExport(directory,original){const file=join(directory,basename(original));copyFileSync(original,file);chmodSync(file,0o600);return file;}

export async function custodyStepsAcceptance({directory,archives,revision,gateway,base,email,team,apiKey,browser,version,platform='linux/amd64',commandEnv=process.env,transportBenchmark=false,apiLog,lab}){
 const preparedImage=prepareCompanionImage({directory,revision,platform});
 const directoryAgent=join(directory,'agent-host');mkdirSync(directoryAgent,{mode:0o700});for(const archive of [`agent-KIT-${revision.slice(0,7)}-${platform.split('/')[1]}.tar.gz`,`verification-${revision.slice(0,7)}-${platform.split('/')[1]}.tar.gz`]){const extracted=spawnSync('tar',['-xpf',join(archives,archive),'-C',directoryAgent],{encoding:'utf8'});assert.equal(extracted.status,0,'Separate archive extraction failed: '+archive);}
 const agent=join(directoryAgent,'agent-kit'),verification=join(directoryAgent,'verification'),output=join(directory,'custody-steps');mkdirSync(output,{mode:0o700});copyFileSync(join(gateway,'state/ca.pem'),join(agent,'gateway-ca.pem'));chmodSync(join(agent,'gateway-ca.pem'),0o600);copyFileSync(join(agent,'gateway-ca.pem'),join(verification,'gateway-ca.pem'));chmodSync(join(verification,'gateway-ca.pem'),0o600);const apiKeyFile=join(agent,'xq-api-key');writeFileSync(apiKeyFile,apiKey+'\n',{mode:0o600});
 const transcript=[],rawOutputs=[],checks=[],deviceName='opintelprobe',session=join(agent,'admin.session'),key=join(agent,'agent.key'),common=['--gateway',base,'--project',browser.projectId],identity=join(agent,'identity-bundles/device-223');
 function record(command,text){rawOutputs.push(text);const lines=text.split('\n');let table=false;const safe=lines.map(line=>{if(line.includes(' | ')){if(!table){table=true;return line;}if(/^[\s|+-]+$/u.test(line))return line;return line.split('|').map(()=> '[redacted]').join(' | ');}return line;}).join('\n');transcript.push('$ '+command+'\n'+safe);}
 function run(root,args,name,expected=0){const result=spawnSync(join(root,args[0]),args.slice(1),{encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,env:{...commandEnv,STEPS_XQ_API_KEY_FILE:apiKeyFile}}),text=(result.stdout??'')+(result.stderr??'');writeFileSync(join(output,name+'.private.log'),text,{mode:0o600});assert.equal(Boolean(result.error),false,name+' process failed');assert.equal(result.status===0,expected===0,name+' exit status mismatch');record('./'+args[0]+' '+args[1]+' [flags supplied; values redacted]',text);return text;}
 const exports=join(homedir(),'.xq/v02/223'),zips=readdirSync(exports).filter(name=>name.endsWith('-223.zip'));assert.equal(zips.length,1,'Original XQ device export missing or ambiguous');
 // Import and exchange occur on the agent host; there is no public handoff.
 const identityExport=stageAgentIdentityExport(directoryAgent,join(exports,zips[0]));
 run(agent,['identities','add',identityExport,'--device',deviceName,'--api-key-file',apiKeyFile],'agent-identity-import');
 checks.push('agent-host-exchange-no-public-handoff');
 const before=await(await fetch('http://127.0.0.1:11825/api/v1/messages')).json(),seen=new Set(before.messages.map(m=>m.ID));
 const sign=spawn(join(verification,'steps'),['sign-in','--gateway',base,'--email',email,'--session-out',session],{stdio:['pipe','pipe','pipe'],env:commandEnv,timeout:180000});let signedOutput='';sign.stdout.on('data',chunk=>{signedOutput+=chunk;});sign.stderr.on('data',chunk=>{signedOutput+=chunk;});const completed=new Promise((resolve,reject)=>{sign.once('error',()=>reject(new Error('steps sign-in process failed')));sign.once('exit',code=>resolve(code));});
 try{
  let link;for(let attempt=0;attempt<120&&!link;attempt++){const messages=await(await fetch('http://127.0.0.1:11825/api/v1/messages')).json(),message=messages.messages.find(m=>!seen.has(m.ID)&&m.To.some(to=>to.Address===email));if(message){const mail=await(await fetch('http://127.0.0.1:11825/api/v1/message/'+message.ID)).json();link=mail.Text.match(/https:\/\/[^\s<>]+/u)?.[0];}else await setTimeout(500);}
  assert.ok(link,'steps sign-in SMTP message missing');sign.stdin.end(link+'\n');assert.equal(await completed,0,'steps sign-in failed');assert.ok(!signedOutput.includes(link),'Sign-in link was echoed');record('./steps sign-in [normal SMTP link pasted; values redacted]',signedOutput);checks.push('steps-normal-smtp-sign-in');
 }finally{if(sign.exitCode===null)sign.kill();writeFileSync(join(output,'sign-in.private.log'),signedOutput,{mode:0o600});}
 async function consoleApi(operation,extra={}){
  const dir=join(output,operation);mkdirSync(dir,{mode:0o700});const config=join(dir,'request.json');writeFileSync(config,JSON.stringify({operation,base,project:browser.projectId,pool:browser.poolId,team,deviceName,...extra}),{mode:0o600});
  const result=spawnSync('docker',['run',...(lab?.labelArgs??[]),'--rm','--init','--ipc=host','--platform',platform,'--volume',resolve('node_modules')+':/work/node_modules:ro','--volume',resolve('scripts/images/steps-custody-browser.mjs')+':/work/browser.mjs:ro','--volume',session+':/input/session:ro','--volume',config+':/input/request.json:ro','--volume',dir+':/result','--workdir','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs'],{encoding:'utf8',timeout:operation==='benchmark-verify'?600000:180000});writeFileSync(join(dir,'console-api.private.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});assert.equal(result.status,0,'Console API '+operation+' failed; private log retained');return JSON.parse(readFileSync(join(dir,'result.json'),'utf8'));
 }
 const prepared=await consoleApi('prepare',{transportBenchmark});checks.push('provider-check-custody-engine-column-decision');
 run(verification,['steps','grant-access',...common,'--pool',browser.poolId,'--agent','Custody terminal agent','--session-file',session,'--key-out',key],'grant-access');checks.push('steps-grant-access');
 const agentFlags=[...common,'--key-file',key,'--agent-id','custody-terminal-agent'],answer=join(agent,'answer.json'),unsealed=join(agent,'unsealed.json');
 run(agent,['steps','query',...agentFlags,'--sql',prepared.sql,'--out',answer],'query');const first=JSON.parse(readFileSync(answer,'utf8'));assert.equal(first.result.rows.length,6);assert.ok(first.result.rows.every(row=>typeof row[1]==='string'&&row[1].startsWith('opintelsealed:v1:')));checks.push('steps-query-sealed-cells');
 run(agent,['steps','redeem-and-unseal',...agentFlags,'--result',answer,'--xq-identity',identity,'--show','--out',unsealed],'redeem-show');const clear=JSON.parse(readFileSync(unsealed,'utf8'));assert.deepEqual(clear.rows,Array.from({length:6},(_,i)=>[i+5,'custody-'+(i+5)]),'Local unseal differs from independent fixture values');checks.push('live-xq-local-unseal-independent-fixture');
 const repeated=join(agent,'repeat-must-not-exist.json');const replay=run(agent,['steps','redeem-and-unseal',...agentFlags,'--result',answer,'--xq-identity',identity,'--show','--out',repeated],'redeem-replay',1);assert.match(replay,/K2 refused/u);assert.ok(!existsSync(repeated));assert.ok(!/custody-[0-9]+/u.test(replay));checks.push('second-redemption-refused-no-plaintext');
 const aggregate=join(agent,'aggregate.json'),aggregateClear=join(agent,'aggregate-clear.json');
 run(agent,['steps','query',...agentFlags,'--sql',prepared.aggregateSql,'--out',aggregate],'aggregate-query');checks.push('steps-aggregate-query-sealed');
 const aggregateResult=JSON.parse(readFileSync(aggregate,'utf8'));assert.equal(aggregateResult.result.rows.length,1);assert.ok(aggregateResult.result.rows[0][0].startsWith('opintelsealed:'));
 run(agent,['steps','redeem-and-unseal',...agentFlags,'--result',aggregate,'--xq-identity',identity,'--out',aggregateClear],'aggregate-unseal');assert.deepEqual(JSON.parse(readFileSync(aggregateClear,'utf8')).rows,[['645']]);checks.push('steps-aggregate-unseal-independent-fixture');
 const aggregateReplay=run(agent,['steps','redeem-and-unseal',...agentFlags,'--result',aggregate,'--xq-identity',identity],'aggregate-replay',1);assert.match(aggregateReplay,/K2 refused/u);checks.push('steps-aggregate-replay-refused');
 const companion=companionCustodyAcceptance({directory:output,agent,key,apiKeyFile,base,project:browser.projectId,sql:prepared.sql,aggregateSql:prepared.aggregateSql,revision,platform,commandEnv,preparedImage,lab});checks.push(...companion.checks.map(check=>'companion-'+check.name));
 // A second real XQ certificate must never reuse the bound pool key.
 const otherExports=join(homedir(),'.xq/v02/224'),otherZips=readdirSync(otherExports).filter(name=>name.endsWith('-224.zip'));assert.equal(otherZips.length,1,'Second XQ export missing or ambiguous');
 const otherIdentityExport=stageAgentIdentityExport(directoryAgent,join(otherExports,otherZips[0]));
 run(agent,['identities','add',otherIdentityExport,'--device','opintelpoola','--api-key-file',apiKeyFile],'mismatch-identity-import');
 const mismatchResult=join(agent,'mismatch-must-not-exist.json');
 run(agent,['steps','query',...agentFlags,'--sql',prepared.sql,'--out',mismatchResult],'identity-mismatch',1);assert.ok(!existsSync(mismatchResult));checks.push('different-certificate-refused-no-rows');
 writeFileSync(join(agent,'active-identity'),'device-223\n',{mode:0o600});
 const pending=join(agent,'pending.json');run(agent,['steps','query',...agentFlags,'--sql',prepared.sql,'--out',pending],'query-for-revocation');const second=JSON.parse(readFileSync(pending,'utf8')),grantId=JSON.parse(Buffer.from(second.result.custody[0].grant.split('.')[1],'base64url').toString()).jti;
 const revoked=await consoleApi('revoke',{grantId,receiptId:second.result.evidenceId});checks.push('console-api-grant-revocation-recorded');
 const blocked=join(agent,'revoked-must-not-exist.json'),refusal=run(agent,['steps','redeem-and-unseal',...agentFlags,'--result',pending,'--xq-identity',identity,'--show','--out',blocked],'redeem-revoked',1);assert.match(refusal,/K2 refused/u);assert.ok(!existsSync(blocked));assert.ok(!/custody-[0-9]+/u.test(refusal));checks.push('revoked-redemption-refused-no-plaintext');
 let benchmark;if(transportBenchmark){
  const startedAt=new Date().toISOString();let failure,verifyTimings=[],callerStep='benchmark-verify';
  try{verifyTimings=(await consoleApi('benchmark-verify')).samples;for(let n=0;n<50;n++){callerStep='benchmark-query-'+n;run(agent,['steps','query',...agentFlags,'--sql',prepared.benchmarkSql,'--quiet'],callerStep);}}catch(error){failure=error;}
  finally{const finishedAt=new Date().toISOString();assert.equal(typeof apiLog,'function','API log capture is required');const logFile=join(output,'transport.private.log');apiLog(logFile);const log=readFileSync(logFile,'utf8');const {transportSamples,publicLatency}=await import('./transport-benchmark.mjs');const rpc=transportSamples(log,{startedAt,finishedAt}),publicVerify=publicLatency(verifyTimings);benchmark={...rpc,status:failure||publicVerify.status!=='passed'?'failed':rpc.status,publicVerify,caller:{status:failure?'failed':'passed',step:callerStep},startedAt,finishedAt};writeFileSync(join(output,'transport-benchmark.json'),JSON.stringify(benchmark,null,2)+'\n',{mode:0o600});}
  if(failure)throw failure;assert.equal(benchmark.status,'passed','Missing or failed benchmark calls; inspect transport-benchmark.json');
 }

 const secrets=[apiKey,readFileSync(key,'utf8').trim(),readFileSync(session,'utf8').trim(),...first.result.custody.map(g=>g.grant),...second.result.custody.map(g=>g.grant)];for(const secret of secrets)assert.equal(rawOutputs.some(text=>text.includes(secret)),false,'Key/session/grant material appeared in terminal output');for(const file of [session,key,answer,unsealed,pending])assert.equal(statSync(file).mode&0o777,0o600);checks.push('private-files-and-no-key-material-in-output');
 writeFileSync(join(output,'terminal-redacted.txt'),transcript.join('\n\n'),{mode:0o600});const result={status:'passed',revision,checks,firstReceipt:first.result.evidenceId,revokedReceipt:second.result.evidenceId,revokedGrant:grantId,revocationRecorded:revoked.revocationRecorded,rowsUnsealed:6,companion,...(benchmark?{transportBenchmark:benchmark}:{}),passed:checks.length,failed:0,terminal:'custody-steps/terminal-redacted.txt'};writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
