import {installedTransportBenchmark} from './installed-transport-benchmark.mjs';
import {acceptanceSelection} from './acceptance-selection.mjs';
import {preflightWithWarmup} from '../preflight-retry.mjs';
import {runLedger} from '../run-ledger.mjs';
import {createAcceptanceLab} from './acceptance-lab.mjs';
import {custodyStepsAcceptance} from './steps-custody-acceptance.mjs';
import {transportRetryEvidence} from './transport-benchmark.mjs';
import {URL} from 'node:url';
const {fetch,AbortSignal}=globalThis;
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,cpSync,chmodSync,statSync,appendFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {request} from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {acceptancePortPreflight,acceptanceMemoryPreflight} from './acceptance-preflight.mjs';
import {captureProcessLog} from './acceptance-log.mjs';
import {setTimeout} from 'node:timers/promises';
import {setTimeout as deadlineTimer,clearTimeout} from 'node:timers';
import {parse} from 'dotenv';
import {auditPackage} from './package-audit.mjs';
import {firstHour} from './first-hour.mjs';
import {firstHourEngine} from './first-hour-engine.mjs';
import {firstHourSource,acceptanceHostAddress} from './first-hour-source.mjs';
import {acceptanceRequest,acceptanceDeadlineMs} from './acceptance-json.mjs';
import {verificationConfig} from './verification-config.mjs';

// External acceptance only. It never alters generated package configuration.
const archives=resolve(process.argv[2]??''),manifest=JSON.parse(readFileSync(process.env.RELEASE_MANIFEST,'utf8'));
const platform=process.env.PLATFORM??'linux/amd64',prefix=manifest.revision.slice(0,7);
let candidate=false,transportBenchmark=false,transportDiagnostics=false,firstHourOnly=false,firstHourActive=false,customerSource,soakDurationSeconds=120;
const selection=acceptanceSelection(process.argv.slice(3));
const acceptanceArgs=selection.remaining;
for(let index=0;index<acceptanceArgs.length;index++){
 const argument=acceptanceArgs[index];
 if(argument==='--candidate')candidate=true;
 else if(argument==='--transport-benchmark')transportBenchmark=true;
 else if(argument==='--transport-diagnostics')transportDiagnostics=true;
 else if(argument==='--first-hour-only')firstHourOnly=true;
 else if(argument==='--duration-seconds'){
  const value=acceptanceArgs[++index];assert.match(value??'',/^[1-9][0-9]*$/u,'--duration-seconds requires a positive integer');
  soakDurationSeconds=Number(value);assert.ok(Number.isSafeInteger(soakDurationSeconds)&&soakDurationSeconds<=86400,'Soak duration must be 1–86400 seconds');
 }else throw new Error('Unknown acceptance argument: '+argument);
}
if(!candidate){assert.equal(manifest.candidate,false,'Published release required');assert.ok(manifest.publishedAt);}
assert.equal(platform,'linux/'+(process.arch==='arm64'?'arm64':'amd64'),'Native acceptance required');
const providerText=readFileSync(process.env.STAGE4_PROVIDER_ENV??'.env','utf8'),provider=parse(providerText);
const relayPasswordLine=providerText.split(/\r?\n/u).findLast(line=>/^\s*SMTP_PASSWORD\s*=/u.test(line));
if(relayPasswordLine!==undefined){let value=relayPasswordLine.slice(relayPasswordLine.indexOf('=')+1);if((value.startsWith("'")&&value.endsWith("'"))||(value.startsWith('"')&&value.endsWith('"')))value=value.slice(1,-1);provider.SMTP_PASSWORD=value;}
const smtpNames=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_SENDER','SMTP_TLS_MODE'];
for(const name of smtpNames)assert.ok(provider[name],'Missing real SMTP relay setting: '+name);

const providerNames=['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'];
for(const name of providerNames)assert.ok(provider[name],'Missing provider setting: '+name);
mkdirSync('tmp',{recursive:true});
const directory=selection.reuse?resolve(selection.reuse):resolve(mkdtempSync('tmp/stage5-acceptance-'));
const checkpoint=selection.reuse?JSON.parse(readFileSync(join(directory,'install-checkpoint.private.json'),'utf8')):null;
if(checkpoint){assert.equal(checkpoint.revision,manifest.revision,'Reuse requires the same pinned images and archives.');assert.equal(checkpoint.archives,archives,'Reuse requires the original archive directory.');assert.equal(statSync(join(directory,'install-checkpoint.private.json')).mode&0o777,0o600);}chmodSync(directory,0o700);
const write=(file,value)=>{writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(file,0o600);};
const result={scope:firstHourOnly?'first-hour':selection.scope==='full'?'stage5':selection.scope,revision:manifest.revision,platform,candidate:!!manifest.candidate,published:!!manifest.publishedAt,status:'running',soakDurationSeconds:firstHourOnly?null:soakDurationSeconds,startedAt:new Date().toISOString(),images:manifest.artifacts.filter(a=>a.platform===platform).map(a=>({target:a.target,digest:a.repoDigests[0],id:a.id})),path:firstHourOnly?'customer archives → install → pair → first-hour public APIs':'customer archives → install → pair → first-hour → demo soak',checks:{}};
const resultFile=join(directory,selection.reuse?'selection-'+Date.now()+'-result.json':'result.json');
result.selection=selection.scope;
const ledger=runLedger(selection.ledger??join(directory,'run-ledger.json'));let ledgerRun;write(resultFile,result);
const unique=randomUUID(),daemon=checkpoint?.daemon??'opintel-stage5-daemon-'+unique,mail=checkpoint?.mail??'opintel-stage5-mail-'+unique;
const daemonVolume=daemon+'-data',nested={...process.env,DOCKER_HOST:'tcp://127.0.0.1:12375',DOCKER_CONTEXT:'',DOCKER_TLS_VERIFY:'',DOCKER_CERT_PATH:'',DOCKER_CLI_HINTS:'false'};
const outer={...process.env,DOCKER_CLI_HINTS:'false'};
const lab=createAcceptanceLab({directory,...(checkpoint?{id:checkpoint.labId}:{}),env:outer});
let phase='preflight',sequence=0,child,childDone,capture;
function advance(name){ledgerRun?.stage(name);phase=name;result.phase=name;write(resultFile,result);console.log('Phase: '+name);}
process.once('beforeExit',()=>{if(result.status==='running'){result.status='failed';result.failure={phase,message:'Acceptance driver ended with an unfinished await.'};write(resultFile,result);console.error('Acceptance driver incomplete: '+resultFile);process.exitCode=1;}});
function bounded(work,ms){let timer;return Promise.race([work,new Promise((_,reject)=>{timer=deadlineTimer(()=>reject(new Error('Acceptance request deadline exceeded')),ms);})]).finally(()=>clearTimeout(timer));}
function run(command,args,{env=outer,log=true,...options}={}){
 if(firstHourActive)assert.ok([join(engine,'sources'),join(agent,'steps')].includes(command),'First-hour driver allows only customer source and agent-kit commands');
 const output=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024,env,stdio:['ignore','pipe','pipe'],...options});
 const file=join(directory,String(++sequence).padStart(3,'0')+'-'+phase.replaceAll(/[^a-z0-9-]/giu,'-')+'.log');
 if(log||output.error||output.status!==0)write(file,(output.stdout??'')+(output.stderr??''));
 if(output.error||output.status!==0)throw new Error(phase+' failed; private log: '+file);
 return output.stdout.trim();
}
async function wait(check,label,timeout=120000){const deadline=Date.now()+timeout;let last;while(Date.now()<deadline){try{return await bounded(Promise.resolve().then(check),Math.min(10000,deadline-Date.now()));}catch(error){last=error;await setTimeout(500);}}throw new Error(label+' timed out'+(last instanceof Error?': '+last.message:''));}
const gateway=join(directory,'gateway'),engine=join(directory,'engine'),agent=join(directory,'agent-kit'),verification=join(directory,'verification');
lab.trackCompose(gateway);lab.trackCompose(engine);
const command=(kind,name,...args)=>run(join(kind==='gateway'?gateway:engine,name),args,{env:nested});
const composeArgs=(kind,...args)=>{const root=kind==='gateway'?gateway:engine;return ['compose','--project-name',readFileSync(join(root,'state/project-name'),'utf8').trim(),'--env-file',join(root,'state/package.env'),'-f',join(root,'state/compose.json'),...args];};
const compose=(kind,...args)=>run('docker',composeArgs(kind,...args),{env:nested});
const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
function https(path,method='GET',body,cookie,headers={}){return bounded(new Promise((resolve,reject)=>{
 const json=acceptanceRequest(path,base,body,cookie,headers);
 const req=request('https://127.0.0.1'+path,{method,ca:readFileSync(join(gateway,'state/ca.pem')),headers:json.headers,timeout:acceptanceDeadlineMs,signal:AbortSignal.timeout(acceptanceDeadlineMs)},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('error',reject);res.on('aborted',()=>reject(new Error('API response aborted')));res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('API timeout')));req.end(json.payload);
 }),35000);}
let base=checkpoint?.base,ownerCookie=checkpoint?.ownerCookie,hostAddress=checkpoint?.hostAddress,clientHost=checkpoint?.clientHost,settings=checkpoint?.settings;
const agentApiKey=join(agent,'xq-api-key'),output=join(verification,'output');
if(checkpoint){customerSource=checkpoint.customerSource;result.checks={...checkpoint.checks};const selectedKeys=[...selection.custody?['custodyRegression']:[],...selection.soak?['packagedSoak']:[],...selection.latency?['transportBenchmark']:[]];for(const key of selectedKeys)delete result.checks[key];result.reusedChecks={revision:checkpoint.revision,keys:Object.keys(result.checks)};}
async function api(path,method='GET',body){const response=await https(path,method,body,ownerCookie);assert.ok(response.status>=200&&response.status<300,'API refused '+path+' ('+response.status+')');return response.text?JSON.parse(response.text):undefined;}

function browserCheck(restore=false){
 const version=JSON.parse(readFileSync('package-lock.json')).packages['node_modules/@playwright/test'].version;
 run('docker',['run',...lab.labelArgs,'--rm','--init','--ipc=host','--platform',platform,'-v',resolve('node_modules')+':/work/node_modules:ro','-v',resolve('scripts/images/package-browser.mjs')+':/work/browser.mjs:ro','-v',directory+':/acceptance','-w','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs',...(restore?['restore']:[])]);
 return JSON.parse(readFileSync(join(directory,'browser-'+(restore?'restored':'initial')+'.json')));
}
try{
 console.log('Stage 5 acceptance directory: '+directory);
 await preflightWithWarmup(async()=>{result.checks.dockerMemory=acceptanceMemoryPreflight({env:outer});if(!checkpoint)await acceptancePortPreflight([443,3100,3101,3102,3103,5434,11465,11825,12375],{env:outer});else{assert.equal(run('docker',['inspect','--format','{{.State.Running}}',daemon],{log:false}),'true','Retained install daemon is not running; do not recreate it silently.');assert.equal((await https('/api/v1/auth/me','GET',undefined,ownerCookie)).status,200,'Retained owner session no longer works.');}},{record:sample=>{result.checks.preflight??=[];result.checks.preflight.push(sample);ledger.preflight({level:'L2',budget:selection.baseline?'L2:baseline':'L2:full',commit:manifest.revision,images:result.images,...sample});write(resultFile,result);}});
 capture=spawn(process.execPath,[resolve('scripts/images/acceptance-resources.mjs'),directory,daemon,String(process.pid)],{env:{...process.env,OPINTEL_CAPTURE_OUTER_HOST:outer.DOCKER_HOST??'',OPINTEL_CAPTURE_OUTER_CONTEXT:outer.DOCKER_CONTEXT??''},stdio:['ignore','ignore','ignore']});
 ledgerRun=ledger.start({level:'L2',budget:selection.baseline?'L2:baseline':'L2:full',stage:selection.scope,commit:manifest.revision,images:result.images});
 if(!checkpoint){
 advance('extract-and-audit-archives');
 for(const kind of ['gateway','engine','agent-kit','verification']){run('tar',['-xpf',join(archives,(kind==='agent-kit'?'agent-KIT':kind)+'-'+prefix+'-'+platform.split('/')[1]+'.tar.gz'),'-C',directory]);auditPackage(join(directory,kind));const release=JSON.parse(readFileSync(join(directory,kind,'release.json')));assert.equal(release.revision,manifest.revision);assert.equal(release.customerPackageVersion,1,'Customer archive marker absent');for(const [target,digest] of Object.entries(release.images))assert.equal(digest,manifest.artifacts.find(a=>a.platform===platform&&a.target===target)?.repoDigests[0],'Archive image provenance mismatch: '+target);}
 const archiveHashes={};for(const kind of ['gateway','engine','agent-kit','verification']){const file=join(archives,(kind==='agent-kit'?'agent-KIT':kind)+'-'+prefix+'-'+platform.split('/')[1]+'.tar.gz'),hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);archiveHashes[kind]={file,sha256:hash.digest('hex')};}
 result.checks.archives={revision:manifest.revision,customerPackageVersion:1,audited:true,archives:archiveHashes,packageEnvironmentKeys:Object.keys(parse(readFileSync(join(gateway,'package.env')))).sort()};
 advance('empty-docker-daemon');write(join(directory,'daemon.json'),{features:{'containerd-snapshotter':true}});
 run('docker',['volume','create',...lab.labelArgs,daemonVolume]);
 run('docker',['run',...lab.labelArgs,'--detach','--privileged','--name',daemon,'--platform',platform,'--env','DOCKER_TLS_CERTDIR=','--publish','127.0.0.1:12375:2375',...['443','3100','3101','3102','3103','5434'].flatMap(port=>['--publish','0.0.0.0:'+port+':'+port]),'--volume',daemonVolume+':/var/lib/docker','--volume',directory+':'+directory,'--volume',join(directory,'daemon.json')+':/etc/docker/daemon.json:ro',upstream['x-acceptance-images'].dockerDaemon,'--tls=false']);
 await wait(()=>run('docker',['info'],{env:nested,log:false}),'Empty daemon startup');
 assert.equal(run('docker',['image','ls','-q'],{env:nested}),'');assert.equal(run('docker',['ps','-aq'],{env:nested}),'');
 result.checks.emptyDocker={imageCount:0,containerCount:0,daemon,volume:daemonVolume};
 advance('package-inputs');

 if(process.platform==='darwin'){const route=run('route',['-n','get','default']);const iface=/interface:\s+(\S+)/u.exec(route)?.[1];assert.ok(iface);hostAddress=run('ipconfig',['getifaddr',iface]);}else hostAddress=run('hostname',['-I']).split(/\s/u)[0];
 clientHost=acceptanceHostAddress(process.platform,hostAddress);base='https://'+clientHost;
 settings={APP_BASE_URL:base,OWNER_EMAIL:'owner@stage5.example',...Object.fromEntries(providerNames.map(name=>[name,provider[name]])),SMTP_HOST:'host.docker.internal',SMTP_PORT:'11465',SMTP_USER:'acceptance',SMTP_PASSWORD:'fixture!$#%=' ,SMTP_SENDER:'noreply@stage5.example',SMTP_TLS_MODE:'implicit',...(transportDiagnostics?{LOG_LEVEL:'debug'}:{})};
 write(join(gateway,'package.env'),Object.entries(settings).map(([name,value])=>name+"='"+value.replaceAll("'","\\'")+"'").join('\n')+'\n');
 const mapping=JSON.parse(readFileSync('scripts/soak/certificates.example.json'));
 advance('gateway-install');command('gateway','install');result.checks.gatewayInstall=true;
 advance('engine-install');const engineInstallOutput=command('engine','install');result.checks.engineInstall=true;
 advance('identity-import');writeFileSync(agentApiKey,provider.OPINTEL_XQ_API_KEY+'\n',{mode:0o600});cpSync(join(gateway,'state/ca.pem'),join(agent,'gateway-ca.pem'));chmodSync(join(agent,'gateway-ca.pem'),0o600);
 for(const entry of mapping){const exports=join(homedir(),'.xq/v02',String(entry.certificateId));const zip=readdirSync(exports).find(name=>name.endsWith('-'+entry.certificateId+'.zip'));assert.ok(zip,'Missing original XQ export for certificate '+entry.certificateId);const imported=join(directory,zip);cpSync(join(exports,zip),imported);chmodSync(imported,0o600);run(join(agent,'identities'),['add',imported,'--device',entry.deviceName,'--api-key-file',agentApiKey],{env:nested});}writeFileSync(join(agent,'active-identity'),'device-223\n',{mode:0o600});result.checks.identityImports={count:mapping.length,command:'agent-kit ./identities add EXPORT.zip --device NAME --api-key-file FILE'};
 for(const [root,keys] of [[gateway,['application','ingress','spicedb','ca']],[engine,['engine','ca']]]){for(const name of keys)assert.equal(statSync(join(root,'state',name+'.key')).mode&0o777,0o600);for(const name of ['audit','control','custody','ingest'])assert.equal(statSync(join(root,'state',name)).mode&0o777,0o700);}
 result.checks.privatePermissions=true;
 const rendered=JSON.parse(compose('gateway','--profile','jobs','config','--format','json'));assert.equal(rendered.services.ingress.ports[0].published,'443');assert.equal(rendered.services['demo-tools'],undefined);assert.equal(rendered.services.api.volumes.some(v=>String(v.source??v).includes('identity-bundles')),false);result.checks.defaultHttpsPort=443;
 advance('mutual-pairing');
 const engineAddress=/Engine address: (\S+)/u.exec(engineInstallOutput)?.[1];assert.ok(engineAddress,'Engine install did not print its address');
 const pairingCode=/Pairing code \(expires in 15 minutes\): (\S+)/u.exec(engineInstallOutput)?.[1];assert.ok(pairingCode,'Engine install did not print a pairing code');command('gateway','register-engine',engineAddress,pairingCode);result.checks.paired={singleCode:true,noFileTransfer:true};
 advance('real-smtp-relay');
 const relayFile=join(directory,'real-smtp.env');
 write(relayFile,smtpNames.map(name=>{assert.ok(!/[\r\n\0]/u.test(provider[name]),'SMTP relay values must be single line');return name+'='+provider[name];}).join('\n')+'\n');
 const operatorService=rendered.services.operator;
 for(const name of smtpNames)delete operatorService.environment[name];
 operatorService.env_file=[{path:relayFile,format:'raw'}];
 const relayCompose=join(directory,'real-smtp-compose.json');write(relayCompose,{services:{operator:operatorService},networks:rendered.networks,volumes:rendered.volumes});
 const relayOutput=run('docker',['compose','--project-name',readFileSync(join(gateway,'state/project-name'),'utf8').trim(),'-f',relayCompose,'run','--rm','--no-deps','--interactive=false','-T','operator','node','scripts/operator/customer-operator.js','mail-test',provider.SMTP_TEST_RECIPIENT??provider.SMTP_SENDER],{env:nested});
 const accepted=/SMTP accepted test message; response code (2[0-9]{2})/u.exec(relayOutput);assert.ok(accepted,'Real SMTP relay must accept an authenticated message');
 result.checks.realSmtpRelay={authenticated:true,acceptedResponse:accepted[1]};
 advance('smtp-fixture');
 const mailDirectory=join(directory,'mail');mkdirSync(mailDirectory,{mode:0o700});
 run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(mailDirectory,'mail.key'),'-out',join(mailDirectory,'mail.csr'),'-subj','/CN=host.docker.internal']);
 write(join(mailDirectory,'mail.ext'),'subjectAltName=DNS:host.docker.internal,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
 run('openssl',['x509','-req','-in',join(mailDirectory,'mail.csr'),'-CA',join(gateway,'state/ca.pem'),'-CAkey',join(gateway,'state/ca.key'),'-CAcreateserial','-out',join(mailDirectory,'mail.pem'),'-days','2','-extfile',join(mailDirectory,'mail.ext')]);
 run('docker',['run',...lab.labelArgs,'--detach','--name',mail,'--platform',platform,'--user',String(process.getuid())+':'+process.getgid(),'--publish','127.0.0.1:11465:1025','--publish','127.0.0.1:11825:8025','--env','MP_SMTP_TLS_CERT=/tls/mail.pem','--env','MP_SMTP_TLS_KEY=/tls/mail.key','--env','MP_SMTP_REQUIRE_TLS=true','--env','MP_SMTP_AUTH_ACCEPT_ANY=false','--env','MP_SMTP_AUTH=acceptance:'+settings.SMTP_PASSWORD,'--volume',mailDirectory+':/tls:ro',upstream['x-acceptance-images'].mailpit]);
 await wait(async()=>assert.equal((await fetch('http://127.0.0.1:11825/api/v1/messages',{signal:AbortSignal.timeout(5000)})).status,200),'SMTP catcher');
 advance('normal-owner-login');
 const email=settings.OWNER_EMAIL;assert.equal((await https('/api/v1/auth/request-link','POST',{email,deviceNonce:'stage5-customer-acceptance'})).status,202);
 const message=await wait(async()=>{const list=await(await fetch('http://127.0.0.1:11825/api/v1/messages',{signal:AbortSignal.timeout(5000)})).json();const found=list.messages.find(m=>m.To.some(to=>to.Address===email));assert.ok(found);return(await fetch('http://127.0.0.1:11825/api/v1/message/'+found.ID,{signal:AbortSignal.timeout(5000)})).json();},'Normal owner SMTP delivery');
 const link=message.Text.match(/https:\/\/[^\s<>]+/u)?.[0];assert.ok(link);
 const response=await https('/api/v1/auth/callback','POST',{token:new URL(link).searchParams.get('token'),deviceNonce:'stage5-customer-acceptance'});assert.equal(response.status,200);ownerCookie=response.headers['set-cookie'].find(value=>value.startsWith('opintel_session=')).split(';')[0];result.checks.normalOwnerSmtpLogin=true;
 advance('first-hour-customer-source');
 customerSource=await firstHourSource({directory,image:upstream['x-acceptance-images'].customerPostgres,host:clientHost,env:outer,lab,recordFailure:(error,fixture)=>{result.status='failed';result.checks.firstHourSource={...fixture,external:true};result.failure={phase,message:error instanceof Error?error.message:'Source fixture failed'};write(resultFile,result);}});
 result.checks.firstHourSource={container:customerSource.name,network:customerSource.network,image:customerSource.image,fixture:'test/fixtures/first-hour/customer.sql',log:customerSource.log,external:true};
 advance('first-hour');
 firstHourActive=true;
 const peer=firstHourEngine(gateway);
 result.checks.firstHour=await firstHour({base,addSource:()=>command('engine','sources','add','first-hour','--host',customerSource.host,'--port',customerSource.port,'--database',customerSource.database,'--user',customerSource.user,'--password-file',customerSource.passwordFile),request:(path,method,body,headers)=>{assert.ok(!(JSON.stringify(body)??'').includes(readFileSync(customerSource.passwordFile,'utf8')),'Source secret reached gateway transport');return https(path,method,body,headers.authorization?undefined:ownerCookie,headers);},engine:{name:'First hour engine',address:peer.address,certificatePin:peer.pin},source:{name:'Demonstration database',kind:'postgres',credentialRef:'secret://sources/first-hour',includeSchemas:['public'],samplingConsent:false,receivesLandings:false,landingStrategy:null},agentQuery:({project,key,sql})=>{const keyFile=join(agent,'first-hour.key'),out=join(agent,'first-hour.json');writeFileSync(keyFile,key+'\n',{mode:0o600});run(join(agent,'steps'),['query','--gateway',base,'--project',project,'--key-file',keyFile,'--agent-id','first-hour','--sql',sql,'--out',out],{env:nested});return {structuredContent:JSON.parse(readFileSync(out,'utf8')).result};},settings:{query:{timeoutSeconds:30,rowLimit:100,memoryLimitMb:256,concurrencyPerPool:2},custody:{provider:'xq',tenant:provider.OPINTEL_XQ_TEAM_ID,region:'us-east-1'}},onProgress:value=>{result.checks.firstHour=value;write(resultFile,result);}});
 firstHourActive=false;
 assert.equal(result.checks.firstHour.status,'passed','First-hour acceptance failed at '+result.checks.firstHour.failure?.step);
 if(!firstHourOnly){
 mkdirSync(output,{mode:0o700});
 cpSync(join(gateway,'state/output/peer.json'),join(output,'peer.json'));chmodSync(join(output,'peer.json'),0o600);
 writeFileSync(join(verification,'network'),readFileSync(join(gateway,'state/project-name'),'utf8').trim()+'_default\n',{mode:0o600});
 writeFileSync(join(verification,'configuration-directory'),join(gateway,'state')+'\n',{mode:0o600});writeFileSync(join(verification,'identities-directory'),join(agent,'identity-bundles')+'\n',{mode:0o600});writeFileSync(join(verification,'agent-api-key-file'),agentApiKey+'\n',{mode:0o600});
 const runtime=parse(readFileSync(join(gateway,'state/runtime.env'),'utf8'));
 // Registration equality is exact: do not reconstruct or normalize the paired heartbeat binding.
 const installed=parse(readFileSync(join(gateway,'state/package.env'),'utf8'));
 const vars=verificationConfig({runtime,provider,ownerEmail:settings.OWNER_EMAIL,applicationUrl:settings.APP_BASE_URL,heartbeatUrl:installed.GATEWAY_HEARTBEAT_URL});
 assert.ok(Object.values(vars).every(v=>!/[\r\n\0]/u.test(v)),'Verification environment values must be single line');writeFileSync(join(verification,'verification.env'),Object.entries(vars).map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600});
 }
 } // Fresh install prerequisites complete; selected runs must reuse this exact install.
 if(!firstHourOnly){
 write(join(directory,'install-checkpoint.private.json'),{revision:manifest.revision,archives,daemon,mail,labId:lab.id,base,ownerCookie,hostAddress,clientHost,settings,customerSource,checks:result.checks});
 if(selection.xq){advance('host-xq-check');command('gateway','xq-check');
 run(join(verification,'demo'),['xq-roundtrip','200'],{env:nested});
 const xqDirectory=join(output,readdirSync(output).filter(name=>name.startsWith('xq-roundtrip-')).sort().at(-1));
 const xqResult=JSON.parse(readFileSync(join(xqDirectory,'result.json')));assert.equal(xqResult.status,'passed');assert.equal(xqResult.keyEncoding,'sdk-base64-hex-256');assert.equal(xqResult.attempted,200);assert.equal(xqResult.verified,200);assert.equal(xqResult.required,200);assert.equal(xqResult.attempts.length,200);assert.equal(new Set(xqResult.attempts.map(attempt=>attempt.id)).size,200);assert.ok(xqResult.attempts.every(attempt=>attempt.verified&&attempt.fetchStatus===200&&!attempt.cleanupFailed));
 result.checks.xqCheck={authenticated:true,escrowRedeemAttempted:200,escrowRedeemVerified:200,result:join(xqDirectory,'result.json')};
 }
 if(selection.custody){advance('packaged-custody-rows-aggregate-companion');const custodyDirectory=join(directory,'custody-check-'+Date.now());mkdirSync(custodyDirectory,{mode:0o700});result.checks.custodyRegression=await custodyStepsAcceptance({directory:custodyDirectory,archives,revision:manifest.revision,gateway,base,email:settings.OWNER_EMAIL,team:provider.OPINTEL_XQ_TEAM_ID,apiKey:provider.OPINTEL_XQ_API_KEY,browser:result.checks.firstHour,version:JSON.parse(readFileSync('package-lock.json')).packages['node_modules/@playwright/test'].version,platform,commandEnv:nested,transportBenchmark,deferTransportBenchmark:true,lab,apiLog:file=>captureProcessLog('docker',composeArgs('gateway','logs','--no-color','--no-log-prefix','api'),file,{env:nested})});
 }
 if(selection.soak){advance('customer-demo-soak');
 // Reuse the explicitly named external customer database, never engine readiness.
 command('engine','sources','add','v01','--host',customerSource.host,'--port',customerSource.port,'--database',customerSource.database,'--user',customerSource.user,'--password-file',customerSource.passwordFile);
 // The seed job overrides host.docker.internal with the nested daemon's gateway.
 // The database port belongs to the outer host, so use its explicit address.
 const target=new URL('postgresql://'+hostAddress+':'+customerSource.port+'/'+customerSource.database);target.username=customerSource.user;target.password=readFileSync(customerSource.passwordFile,'utf8');
 writeFileSync(join(output,'v01-uri'),target.href,{mode:0o600});
 writeFileSync(join(output,'owner.cookie'),ownerCookie,{mode:0o600});
 const existingRuns=new Set(readdirSync(output).filter(name=>name.startsWith('soak-run-')));
 const soakLog=join(directory,'demo-soak-'+Date.now()+'.log');child=spawn(join(verification,'demo'),['soak',String(soakDurationSeconds),'--target-file','/output/v01-uri','--source-ref','secret://sources/v01','--session-file','/output/owner.cookie'],{env:nested,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>appendFileSync(soakLog,chunk,{mode:0o600}));child.stderr.on('data',chunk=>appendFileSync(soakLog,chunk,{mode:0o600}));childDone=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 let runDirectory,jsonl;
 await wait(()=>{if(child.exitCode!==null)throw new Error('Demo exited '+child.exitCode+'; '+soakLog);runDirectory=join(output,readdirSync(output).find(name=>name.startsWith('soak-run-')&&!existingRuns.has(name))??'not-started');const soak=join(runDirectory,'soak');jsonl=join(soak,readdirSync(soak).find(name=>name.endsWith('.jsonl'))??'not-started');assert.ok(readFileSync(jsonl,'utf8').includes('"type":"start"'));},'Packaged soak start',300000);
 const provision=JSON.parse(readFileSync(join(output,'provision.json')));
 const events=()=>{const text=readFileSync(jsonl,'utf8');return text.slice(0,text.lastIndexOf('\n')).split('\n').filter(Boolean).map(line=>JSON.parse(line));};
 if(selection.browser){advance('packaged-browser');command('gateway','invite','admin@stage5.example','--role','admin');
 write(join(directory,'browser.json'),{base:'https://host.docker.internal',mail:'http://host.docker.internal:11825',email:'admin@stage5.example',projectId:provision.projectId,projectName:'Reinsurance demonstration'});result.checks.browser=browserCheck();

 advance('console-outage');const before=new Set(events().filter(e=>e.type==='receipt').map(e=>e.id));compose('gateway','stop','console');const stoppedAt=new Date().toISOString();assert.equal((await https('/sign-in')).status,502);
 for(let n=0;n<4;n++){await api('/healthz');await api('/api/v1/projects/'+provision.projectId+'/runs?limit=1');await setTimeout(5000);}
 const during=events(),successful=new Set(during.filter(e=>e.type==='query'&&e.outcome==='success').map(e=>e.response?.structuredContent?.evidenceId)),verified=during.filter(e=>e.type==='receipt'&&!before.has(e.id)&&successful.has(e.id));assert.ok(verified.length,'No query/receipt completed during console outage');
 compose('gateway','start','console');await wait(async()=>assert.equal((await https('/sign-in')).status,200),'Console return');result.checks.consoleIsolation={stoppedAt,resumedAt:new Date().toISOString(),verifiedQueriesDuringOutage:verified.length};result.checks.browserRestored=browserCheck(true);
 }
 advance('soak-result');assert.equal(await childDone,0,'Customer demo soak failed');child=undefined;
 const soakResult=JSON.parse(readFileSync(join(runDirectory,'result.json'))),summary=events().at(-1);assert.equal(soakResult.status,'passed');assert.equal(summary.status,'PASSED');assert.equal(summary.operationalErrors,0);assert.equal(summary.invariantBreaches,0);assert.equal(summary.receiptInvariants.checksSkipped,0);assert.ok(summary.custody.verifiedValues>0);
 result.checks.packagedSoak={durationSeconds:soakDurationSeconds,latencyMs:summary.latencyMs,coverage:summary.coverage,result:join(runDirectory,'result.json'),jsonl,steps:soakResult.steps,operationalErrors:0,invariantBreaches:0,receiptChecksSkipped:0,custodyVerifiedValues:summary.custody.verifiedValues};

 }
 if(transportBenchmark&&selection.latency){advance('transport-benchmark');result.checks.transportBenchmark=await installedTransportBenchmark({directory,gateway,agent,verification,base,ownerCookie,env:nested,lab,platform,run,apiLog:file=>captureProcessLog('docker',composeArgs('gateway','logs','--no-color','--no-log-prefix','api'),file,{env:nested})});}

 }
 result.status='passed';result.finishedAt=new Date().toISOString();
}catch(error){result.status='failed';result.failure={phase,message:error instanceof Error?error.message:'Acceptance failed'};process.exitCode=1;}
finally{
 firstHourActive=false;
 if(capture){if(capture.exitCode!==null&&capture.exitCode!==0){result.checks.resourceCapture={status:'failed',exitCode:capture.exitCode};result.status='failed';process.exitCode=1;}capture.kill('SIGTERM');await new Promise(resolve=>capture.exitCode!==null?resolve():capture.once('exit',resolve));}
 if(child&&child.exitCode===null){child.kill('SIGTERM');await childDone;}
 write(resultFile,result); // Results precede any source/daemon teardown.
 const retain=selection.retain&&result.status==='passed';
 if(customerSource?.close&&!retain){try{customerSource.close();}catch(error){result.cleanupIncomplete=true;result.status='failed';process.exitCode=1;result.cleanupFailures=[{step:'customer-source',message:error instanceof Error?error.message:'Fixture cleanup failed'}];}}
 const cleanupFailure=(step,error)=>{result.cleanupIncomplete=true;result.status='failed';process.exitCode=1;result.cleanupFailures??=[];result.cleanupFailures.push({step,message:error instanceof Error?error.message:'Cleanup failed'});};
 if(transportDiagnostics&&existsSync(join(gateway,'state/compose.json'))){
  try{const file=join(directory,'gateway-transport.log');captureProcessLog('docker',composeArgs('gateway','logs','--no-color','--no-log-prefix','api'),file,{env:nested});result.checks.transportDiagnostics=transportRetryEvidence(readFileSync(file,'utf8'));write(join(directory,'transport-diagnostics.json'),result.checks.transportDiagnostics);}catch(error){cleanupFailure('retain-transport-diagnostics',error);}
 }
 if(result.status==='failed'&&['real-smtp-relay','smtp-fixture','normal-owner-login'].includes(phase)){
  try{
   captureProcessLog('docker',['ps','--all','--no-trunc','--format','json'],join(directory,'smtp-container-list.jsonl'),{env:nested});
   const listed=spawnSync('docker',['ps','--all','--quiet'],{encoding:'utf8',env:nested,timeout:10000});
   if(listed.status!==0)cleanupFailure('retain-smtp-container-state',new Error('SMTP container state enumeration failed'));
   const ids=listed.status===0?listed.stdout.trim().split(/\s+/u).filter(Boolean):[];
   if(ids.length)captureProcessLog('docker',['inspect','--format','{"name":{{json .Name}},"state":{{json .State}}}',...ids],join(directory,'smtp-container-states.jsonl'),{env:nested});
  }catch(error){cleanupFailure('retain-smtp-container-state',error);}
 }
 for(const kind of ['gateway','engine'])if(existsSync(join(directory,kind,'state/compose.json'))){
  try{captureProcessLog('docker',composeArgs(kind,'logs','--no-color'),join(directory,kind+'-services.log'),{env:nested});}catch(error){cleanupFailure('retain-'+kind+'-logs',error);}
 }
 for(const name of [mail,daemon]){const found=spawnSync('docker',['inspect',name],{encoding:'utf8',env:outer});if(found.status===0){
  try{captureProcessLog('docker',['logs',name],join(directory,name+'.log'),{env:outer});}catch(error){cleanupFailure('retain-fixture-logs',error);}
 }}
 result.labCleanup=retain?lab.retain():lab.cleanup();if(!['passed','retained'].includes(result.labCleanup.status)){result.cleanupIncomplete=true;result.status='failed';process.exitCode=1;}
 ledgerRun?.finish(result.status,{stage:phase,report:resultFile});result.runLedger=ledger.snapshot();write(resultFile,result);console.log((firstHourOnly?'First-hour':'Stage 5')+' acceptance '+result.status+': '+resultFile);
}
