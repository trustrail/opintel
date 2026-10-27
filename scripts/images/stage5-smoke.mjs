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
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:net';
import {setTimeout} from 'node:timers/promises';
import {setTimeout as deadlineTimer,clearTimeout} from 'node:timers';
import {parse} from 'dotenv';
import {auditPackage} from './package-audit.mjs';

// External acceptance only. It never alters generated package configuration.
const archives=resolve(process.argv[2]??''),manifest=JSON.parse(readFileSync(process.env.RELEASE_MANIFEST,'utf8'));
const platform=process.env.PLATFORM??'linux/amd64',prefix=manifest.revision.slice(0,7);
const candidate=process.argv[3]==='--candidate';if(!candidate){assert.equal(manifest.candidate,false,'Published release required');assert.ok(manifest.publishedAt);}
assert.equal(platform,'linux/'+(process.arch==='arm64'?'arm64':'amd64'),'Native acceptance required');
const provider=parse(readFileSync(process.env.STAGE4_PROVIDER_ENV??'.env','utf8'));
const providerNames=['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'];
for(const name of providerNames)assert.ok(provider[name],'Missing provider setting: '+name);
mkdirSync('tmp',{recursive:true});
const directory=resolve(mkdtempSync('tmp/stage5-acceptance-'));chmodSync(directory,0o700);
const write=(file,value)=>{writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(file,0o600);};
const result={revision:manifest.revision,platform,candidate:!!manifest.candidate,published:!!manifest.publishedAt,status:'running',startedAt:new Date().toISOString(),images:manifest.artifacts.filter(a=>a.platform===platform).map(a=>({target:a.target,digest:a.repoDigests[0],id:a.id})),path:'customer archives → install → pair → demo soak',checks:{}};
const resultFile=join(directory,'result.json');write(resultFile,result);
const unique=Date.now().toString(),daemon='opintel-stage5-daemon-'+unique,mail='opintel-stage5-mail-'+unique;
const daemonVolume=daemon+'-data',nested={...process.env,DOCKER_HOST:'tcp://127.0.0.1:12375',DOCKER_CONTEXT:'',DOCKER_TLS_VERIFY:'',DOCKER_CERT_PATH:'',DOCKER_CLI_HINTS:'false'};
const outer={...process.env,DOCKER_CLI_HINTS:'false'};
let phase='preflight',sequence=0,child,childDone;
function advance(name){phase=name;result.phase=name;write(resultFile,result);console.log('Phase: '+name);}
process.once('beforeExit',()=>{if(result.status==='running'){result.status='failed';result.failure={phase,message:'Acceptance driver ended with an unfinished await.'};write(resultFile,result);console.error('Acceptance driver incomplete: '+resultFile);process.exitCode=1;}});
function bounded(work,ms){let timer;return Promise.race([work,new Promise((_,reject)=>{timer=deadlineTimer(()=>reject(new Error('Acceptance request deadline exceeded')),ms);})]).finally(()=>clearTimeout(timer));}
function run(command,args,{env=outer,log=true,...options}={}){
 const output=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024,env,stdio:['ignore','pipe','pipe'],...options});
 const file=join(directory,String(++sequence).padStart(3,'0')+'-'+phase.replaceAll(/[^a-z0-9-]/giu,'-')+'.log');
 if(log||output.error||output.status!==0)write(file,(output.stdout??'')+(output.stderr??''));
 if(output.error||output.status!==0)throw new Error(phase+' failed; private log: '+file);
 return output.stdout.trim();
}
async function wait(check,label,timeout=120000){const deadline=Date.now()+timeout;let last;while(Date.now()<deadline){try{return await bounded(Promise.resolve().then(check),Math.min(10000,deadline-Date.now()));}catch(error){last=error;await setTimeout(500);}}throw new Error(label+' timed out'+(last instanceof Error?': '+last.message:''));}
const gateway=join(directory,'gateway'),engine=join(directory,'engine');
const command=(kind,name,...args)=>run(join(kind==='gateway'?gateway:engine,name),args,{env:nested});
const compose=(kind,...args)=>{const root=kind==='gateway'?gateway:engine;return run('docker',['compose','--project-name',readFileSync(join(root,'state/project-name'),'utf8').trim(),'--env-file',join(root,'state/package.env'),'-f',join(root,'state/compose.json'),...args],{env:nested});};
const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
function https(path,method='GET',body,cookie){return bounded(new Promise((resolve,reject)=>{
 const req=request('https://127.0.0.1'+path,{method,ca:readFileSync(join(gateway,'state/ca.pem')),headers:{origin:base,'content-type':'application/json',...(cookie?{cookie}:{})},signal:AbortSignal.timeout(30000)},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('error',reject);res.on('aborted',()=>reject(new Error('API response aborted')));res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('API timeout')));req.end(body===undefined?undefined:JSON.stringify(body));
 }),35000);}
let base,ownerCookie;
async function api(path,method='GET',body){const response=await https(path,method,body,ownerCookie);assert.ok(response.status>=200&&response.status<300,'API refused '+path+' ('+response.status+')');return response.text?JSON.parse(response.text):undefined;}
function protect(path){const st=statSync(path);chmodSync(path,st.isDirectory()?0o700:0o600);if(st.isDirectory())for(const name of readdirSync(path))protect(join(path,name));}
function browserCheck(restore=false){
 const version=JSON.parse(readFileSync('package-lock.json')).packages['node_modules/@playwright/test'].version;
 run('docker',['run','--rm','--init','--ipc=host','--platform',platform,'-v',resolve('node_modules')+':/work/node_modules:ro','-v',resolve('scripts/images/package-browser.mjs')+':/work/browser.mjs:ro','-v',directory+':/acceptance','-w','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs',...(restore?['restore']:[])]);
 return JSON.parse(readFileSync(join(directory,'browser-'+(restore?'restored':'initial')+'.json')));
}
try{
 console.log('Stage 5 acceptance directory: '+directory);
 for(const port of [443,3100,3101,3102,5434,11465,11825,12375])await new Promise((resolve,reject)=>{const server=createServer();server.once('error',error=>{const owner=spawnSync('docker',['ps','--filter','publish='+port,'--format','{{.Names}} ({{.Label "com.docker.compose.project"}})'],{encoding:'utf8',env:outer});if(error.code==='EACCES'&&!owner.stdout?.trim()){resolve();return;}reject(new Error('Port '+port+' preflight failed ('+error.code+'): '+(owner.stdout?.trim()||'host listener or bind failure')+'; inspect that listener before acceptance.')); });server.listen(port,'0.0.0.0',()=>server.close(resolve));});
 advance('extract-and-audit-archives');
 for(const kind of ['gateway','engine']){run('tar',['-xpf',join(archives,kind+'-'+prefix+'-'+platform.split('/')[1]+'.tar.gz'),'-C',directory]);auditPackage(join(directory,kind));const release=JSON.parse(readFileSync(join(directory,kind,'release.json')));assert.equal(release.revision,manifest.revision);assert.equal(release.customerPackageVersion,1,'Customer archive marker absent');for(const [target,digest] of Object.entries(release.images))assert.equal(digest,manifest.artifacts.find(a=>a.platform===platform&&a.target===target)?.repoDigests[0],'Archive image provenance mismatch: '+target);}
 const archiveHashes={};for(const kind of ['gateway','engine']){const file=join(archives,kind+'-'+prefix+'-'+platform.split('/')[1]+'.tar.gz'),hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);archiveHashes[kind]={file,sha256:hash.digest('hex')};}
 result.checks.archives={revision:manifest.revision,customerPackageVersion:1,audited:true,archives:archiveHashes,packageEnvironmentKeys:Object.keys(parse(readFileSync(join(gateway,'package.env')))).sort()};
 advance('empty-docker-daemon');write(join(directory,'daemon.json'),{features:{'containerd-snapshotter':true}});
 run('docker',['run','--detach','--privileged','--name',daemon,'--platform',platform,'--env','DOCKER_TLS_CERTDIR=','--publish','127.0.0.1:12375:2375',...['443','3100','3101','3102','5434'].flatMap(port=>['--publish','0.0.0.0:'+port+':'+port]),'--volume',daemonVolume+':/var/lib/docker','--volume',directory+':'+directory,'--volume',join(directory,'daemon.json')+':/etc/docker/daemon.json:ro',upstream['x-acceptance-images'].dockerDaemon,'--tls=false']);
 await wait(()=>run('docker',['info'],{env:nested,log:false}),'Empty daemon startup');
 assert.equal(run('docker',['image','ls','-q'],{env:nested}),'');assert.equal(run('docker',['ps','-aq'],{env:nested}),'');
 result.checks.emptyDocker={imageCount:0,containerCount:0,daemon,volume:daemonVolume};
 advance('package-inputs');
 let hostAddress;
 if(process.platform==='darwin'){const route=run('route',['-n','get','default']);const iface=/interface:\s+(\S+)/u.exec(route)?.[1];assert.ok(iface);hostAddress=run('ipconfig',['getifaddr',iface]);}else hostAddress=run('hostname',['-I']).split(/\s/u)[0];
 base='https://'+hostAddress;
 const settings={APP_BASE_URL:base,OWNER_EMAIL:'owner@stage5.example',...Object.fromEntries(providerNames.map(name=>[name,provider[name]])),SMTP_HOST:'host.docker.internal',SMTP_PORT:'11465',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_SENDER:'noreply@stage5.example',SMTP_TLS_MODE:'implicit'};
 write(join(gateway,'package.env'),Object.entries(settings).map(([name,value])=>name+"='"+value.replaceAll("'","\\'")+"'").join('\n')+'\n');
 const identities=join(gateway,'identities');mkdirSync(identities,{mode:0o700});
 const mapping=JSON.parse(readFileSync('scripts/soak/certificates.example.json'));
 for(const entry of mapping){cpSync(join(homedir(),'.xq/v02',String(entry.certificateId)),join(identities,String(entry.certificateId)),{recursive:true});entry.bundlePath=String(entry.certificateId);}
 write(join(identities,'certificates.json'),mapping);protect(identities);
 advance('gateway-install');command('gateway','install');result.checks.gatewayInstall=true;
 advance('engine-install');command('engine','install');result.checks.engineInstall=true;
 for(const [root,keys] of [[gateway,['application','ingress','spicedb','ca']],[engine,['engine','ca']]]){for(const name of keys)assert.equal(statSync(join(root,'state',name+'.key')).mode&0o777,0o600);for(const name of ['audit','control','custody','ingest'])assert.equal(statSync(join(root,'state',name)).mode&0o777,0o700);}
 result.checks.privatePermissions=true;
 const rendered=JSON.parse(compose('gateway','--profile','jobs','config','--format','json'));assert.equal(rendered.services.ingress.ports[0].published,'443');assert.equal(rendered.services['demo-tools'].environment.APPLICATION_TLS_CONFIG,'/config/application-tls.json');result.checks.defaultHttpsPort=443;
 advance('mutual-pairing');
 const gatewayIdentity=JSON.parse(readFileSync(join(gateway,'trust.json'))),engineIdentity=JSON.parse(readFileSync(join(engine,'state/gateway-registration.json')));
 command('engine','register',join(gateway,'trust.json'),gatewayIdentity.pin);command('gateway','register-engine',join(engine,'state/gateway-registration.json'),engineIdentity.pin);result.checks.paired=true;
 advance('smtp-fixture');
 const mailDirectory=join(directory,'mail');mkdirSync(mailDirectory,{mode:0o700});
 run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(mailDirectory,'mail.key'),'-out',join(mailDirectory,'mail.csr'),'-subj','/CN=host.docker.internal']);
 write(join(mailDirectory,'mail.ext'),'subjectAltName=DNS:host.docker.internal,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
 run('openssl',['x509','-req','-in',join(mailDirectory,'mail.csr'),'-CA',join(gateway,'state/ca.pem'),'-CAkey',join(gateway,'state/ca.key'),'-CAcreateserial','-out',join(mailDirectory,'mail.pem'),'-days','2','-extfile',join(mailDirectory,'mail.ext')]);
 run('docker',['run','--detach','--name',mail,'--platform',platform,'--user',String(process.getuid())+':'+process.getgid(),'--publish','127.0.0.1:11465:1025','--publish','127.0.0.1:11825:8025','--env','MP_SMTP_TLS_CERT=/tls/mail.pem','--env','MP_SMTP_TLS_KEY=/tls/mail.key','--env','MP_SMTP_REQUIRE_TLS=true','--volume',mailDirectory+':/tls:ro',upstream['x-acceptance-images'].mailpit]);
 await wait(async()=>assert.equal((await fetch('http://127.0.0.1:11825/api/v1/messages',{signal:AbortSignal.timeout(5000)})).status,200),'SMTP catcher');
 advance('normal-owner-login');
 const email=settings.OWNER_EMAIL;assert.equal((await https('/api/v1/auth/request-link','POST',{email,deviceNonce:'stage5-customer-acceptance'})).status,202);
 const message=await wait(async()=>{const list=await(await fetch('http://127.0.0.1:11825/api/v1/messages',{signal:AbortSignal.timeout(5000)})).json();const found=list.messages.find(m=>m.To.some(to=>to.Address===email));assert.ok(found);return(await fetch('http://127.0.0.1:11825/api/v1/message/'+found.ID,{signal:AbortSignal.timeout(5000)})).json();},'Normal owner SMTP delivery');
 const link=message.Text.match(/https:\/\/[^\s<>]+/u)?.[0];assert.ok(link);
 const response=await https('/api/v1/auth/callback','POST',{token:new URL(link).searchParams.get('token'),deviceNonce:'stage5-customer-acceptance'});assert.equal(response.status,200);ownerCookie=response.headers['set-cookie'].find(value=>value.startsWith('opintel_session=')).split(';')[0];result.checks.normalOwnerSmtpLogin=true;
 advance('host-xq-check');command('gateway','xq-check');result.checks.xqCheck=true;
 advance('customer-demo-soak');
 const soakLog=join(directory,'demo-soak.log');child=spawn(join(gateway,'demo'),['soak','120'],{env:nested,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>appendFileSync(soakLog,chunk,{mode:0o600}));child.stderr.on('data',chunk=>appendFileSync(soakLog,chunk,{mode:0o600}));childDone=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 const output=join(gateway,'state/output');let runDirectory,jsonl;
 await wait(()=>{if(child.exitCode!==null)throw new Error('Demo exited '+child.exitCode+'; '+soakLog);runDirectory=join(output,readdirSync(output).find(name=>name.startsWith('soak-run-'))??'not-started');const soak=join(runDirectory,'soak');jsonl=join(soak,readdirSync(soak).find(name=>name.endsWith('.jsonl'))??'not-started');assert.ok(readFileSync(jsonl,'utf8').includes('"type":"start"'));},'Packaged soak start',300000);
 const provision=JSON.parse(readFileSync(join(output,'provision.json')));
 advance('packaged-browser');command('gateway','invite','admin@stage5.example','--role','admin');
 write(join(directory,'browser.json'),{base:'https://host.docker.internal',mail:'http://host.docker.internal:11825',email:'admin@stage5.example',projectId:provision.projectId,projectName:'Reinsurance demonstration'});result.checks.browser=browserCheck();
 const events=()=>{const text=readFileSync(jsonl,'utf8');return text.slice(0,text.lastIndexOf('\n')).split('\n').filter(Boolean).map(line=>JSON.parse(line));};
 advance('console-outage');const before=new Set(events().filter(e=>e.type==='receipt').map(e=>e.id));compose('gateway','stop','console');const stoppedAt=new Date().toISOString();assert.equal((await https('/sign-in')).status,502);
 for(let n=0;n<4;n++){await api('/healthz');await api('/api/v1/projects/'+provision.projectId+'/runs?limit=1');await setTimeout(5000);}
 const during=events(),successful=new Set(during.filter(e=>e.type==='query'&&e.outcome==='success').map(e=>e.response?.structuredContent?.evidenceId)),verified=during.filter(e=>e.type==='receipt'&&!before.has(e.id)&&successful.has(e.id));assert.ok(verified.length,'No query/receipt completed during console outage');
 compose('gateway','start','console');await wait(async()=>assert.equal((await https('/sign-in')).status,200),'Console return');result.checks.consoleIsolation={stoppedAt,resumedAt:new Date().toISOString(),verifiedQueriesDuringOutage:verified.length};result.checks.browserRestored=browserCheck(true);
 advance('soak-result');assert.equal(await childDone,0,'Customer demo soak failed');child=undefined;
 const soakResult=JSON.parse(readFileSync(join(runDirectory,'result.json'))),summary=events().at(-1);assert.equal(soakResult.status,'passed');assert.equal(summary.status,'PASSED');assert.equal(summary.operationalErrors,0);assert.equal(summary.invariantBreaches,0);assert.equal(summary.receiptInvariants.checksSkipped,0);assert.ok(summary.custody.verifiedValues>0);
 result.checks.packagedSoak={result:join(runDirectory,'result.json'),jsonl,steps:soakResult.steps,operationalErrors:0,invariantBreaches:0,receiptChecksSkipped:0,custodyVerifiedValues:summary.custody.verifiedValues};
 result.status='passed';result.finishedAt=new Date().toISOString();
}catch(error){result.status='failed';result.failure={phase,message:error instanceof Error?error.message:'Acceptance failed'};process.exitCode=1;}
finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await childDone;}
 write(resultFile,result); // Results precede any source/daemon teardown.
 for(const kind of ['gateway','engine'])if(existsSync(join(directory,kind,'state/compose.json'))){try{phase='retain-'+kind+'-logs';write(join(directory,kind+'-services.log'),compose(kind,'logs','--no-color'));command(kind,'stop');}catch{result.cleanupIncomplete=true;result.status='failed';process.exitCode=1;}}
 for(const name of [mail,daemon]){const found=spawnSync('docker',['inspect',name],{encoding:'utf8',env:outer});if(found.status===0){const logs=spawnSync('docker',['logs',name],{encoding:'utf8',env:outer});write(join(directory,name+'.log'),(logs.stdout??'')+(logs.stderr??''));const stopped=spawnSync('docker',['stop',name],{stdio:'ignore',env:outer,timeout:60000});if(stopped.status!==0){result.cleanupIncomplete=true;result.status='failed';process.exitCode=1;}}}
 write(resultFile,result);console.log('Stage 5 acceptance '+result.status+': '+resultFile);
}
