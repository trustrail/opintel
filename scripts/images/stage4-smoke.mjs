import {parse} from 'dotenv';
import {createServer} from 'node:net';
import {homedir} from 'node:os';
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,appendFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,X509Certificate,createHash} from 'node:crypto';
import {request} from 'node:https';
import {request as httpRequest} from 'node:http';
import {setTimeout} from 'node:timers/promises';
import {URL} from 'node:url';
import {packageDeployment} from './package.mjs';

for(const port of [14873,14800,14811,14812,14810,14899,14825,16432,16433,16435,17379,16051])await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'0.0.0.0',()=>server.close(resolve));});

// External synthetic acceptance only. Nothing here is copied into product images.
const platform=process.env.PLATFORM??'linux/amd64';
const sourceLimits={maxConnectionsPerSource:8,statementTimeoutMs:30000,operationTimeoutMs:35000},soakRateMs=10000,engineWorkers=16;
const xq=parse(readFileSync(process.env.STAGE4_PROVIDER_ENV??'.env','utf8'));
for(const name of ['OPINTEL_CUSTODY_MASTER_KEY','OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_REDEEM_URL','OPINTEL_XQ_TEAM_ID'])if(!xq[name])throw new Error('Missing provider setting '+name);
if(!['linux/amd64','linux/arm64'].includes(platform))throw new Error('PLATFORM must be linux/amd64 or linux/arm64.');
function exec(command,args,options={}){
 const result=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024,...options});
 if((result.error||result.status!==0)&&args.some(a=>a==='provision'||a==='demo-tools'))writeFileSync(join(directory,'failed-operator-'+Date.now()+'.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});
 if(result.error||result.status!==0)throw new Error(`${command} failed (${result.status}): ${result.stderr??''}`);
 return result.stdout.trim();
}
const tag=process.env.TAG??'candidate-stage4-core',directory=resolve(mkdtempSync('tmp/stage4-acceptance-'));
const gatewayProject='opintel-gateway-proof-'+Date.now(),engineProject='opintel-engine-proof-'+Date.now(),sourceProject='opintel-source-proof-'+Date.now();
const gatewayDirectory=join(directory,'gateway'),engineDirectory=join(directory,'engine'),consoleDirectory=join(directory,'console');
for(const path of [gatewayDirectory,engineDirectory,consoleDirectory,...[gatewayDirectory,engineDirectory].map(d=>join(d,'tls')),join(engineDirectory,'audit'),join(engineDirectory,'custody'),join(engineDirectory,'ingest'),join(engineDirectory,'state'),join(engineDirectory,'xq'),join(gatewayDirectory,'xq')])mkdirSync(path,{recursive:true});
for(const path of [gatewayDirectory,engineDirectory,consoleDirectory,join(gatewayDirectory,'tls'),join(engineDirectory,'tls')])chmodSync(path,0o755);
for(const name of ['audit','custody','ingest'])chmodSync(join(engineDirectory,name),0o777);
const write=(file,value,mode=0o600)=>writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode});
const envFile=(file,values)=>write(file,Object.entries(values).map(([name,value])=>`${name}=${value}`).join('\n')+'\n');
const published=process.env.RELEASE_MANIFEST?JSON.parse(readFileSync(process.env.RELEASE_MANIFEST,'utf8')):undefined;
const images={};for(const name of ['api','console','engine','egress','migrations','provisioning','demo-tools']){
 const records=published?.artifacts.filter(value=>value.target===name&&value.platform===platform);
 if(records&&records.length!==1)throw new Error('Published artifact missing or ambiguous: '+name);
 const ref=records?.[0]?.repoDigests?.[0];
 if(ref){assert.match(ref,new RegExp(`^ghcr.io/trustrail/opintel-${name}@sha256:[a-f0-9]{64}$`,'u'));exec('docker',['pull','--platform',platform,ref]);}
 const info=JSON.parse(exec('docker',['image','inspect','--platform',platform,ref??`opintel-${name}:${tag}-${platform.replace('/','-')}`]))[0];
 const digest=ref??info.RepoDigests?.find(value=>value.startsWith(`opintel-${name}@sha256:`));if(!digest)throw new Error('Missing audited image digest: '+name);images[name]=digest;
}
const hostAddress=process.env.STAGE4_HOST_ADDRESS??exec('docker',['run','--rm','--platform',platform,images.api,'node','-e',"require('node:dns').lookup('host.docker.internal',{family:4},(error,value)=>{if(error)process.exit(1);console.log(value);})"]);
assert.match(hostAddress,/^\d+\.\d+\.\d+\.\d+$/u);
const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
const packages=join(directory,'packages');
packageDeployment(published??{revision:exec('git',['rev-parse','HEAD']),candidate:true,dirty:true,upstream,artifacts:Object.entries(images).map(([target,digest])=>({target,platform,repoDigests:[digest]}))},packages,platform,{candidate:true});
const password=randomBytes(24).toString('hex'),runtimePassword=randomBytes(24).toString('hex'),spiceToken=randomBytes(24).toString('hex');
const sourceUrl=`postgresql://source:${password}@${hostAddress}:16435/source`;
exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'ca.key'),'-out',join(directory,'ca.pem'),'-subj','/CN=Disposable stage4 CA','-days','2']);
function certificate(name,output,sans){
 exec('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(output,name+'.key'),'-out',join(directory,name+'.csr'),'-subj',`/CN=${name}`]);
 write(join(directory,name+'.ext'),`subjectAltName=${sans}\nextendedKeyUsage=serverAuth,clientAuth\n`);
 exec('openssl',['x509','-req','-in',join(directory,name+'.csr'),'-CA',join(directory,'ca.pem'),'-CAkey',join(directory,'ca.key'),'-CAcreateserial','-out',join(output,name+'.pem'),'-days','2','-extfile',join(directory,name+'.ext')]);
 chmodSync(join(output,name+'.key'),0o644); // Disposable synthetic identities only.
}
certificate('application',join(gatewayDirectory,'tls'),`DNS:localhost,IP:127.0.0.1,IP:${hostAddress}`);
certificate('spicedb',join(gatewayDirectory,'tls'),'DNS:spicedb,DNS:localhost,IP:127.0.0.1');
certificate('engine',join(engineDirectory,'tls'),`DNS:localhost,IP:127.0.0.1,IP:${hostAddress}`);
certificate('mailpit',join(gatewayDirectory,'tls'),'DNS:mailpit,DNS:localhost,IP:127.0.0.1');
certificate('console',consoleDirectory,`DNS:localhost,IP:127.0.0.1,IP:${hostAddress}`);
for(const output of [join(gatewayDirectory,'tls'),join(engineDirectory,'tls')])write(join(output,'ca.pem'),readFileSync(join(directory,'ca.pem'),'utf8'),0o644);
write(join(engineDirectory,'tls','application.pem'),readFileSync(join(gatewayDirectory,'tls','application.pem'),'utf8'),0o644);
write(join(gatewayDirectory,'application-tls.json'),{caFile:'tls/ca.pem',certFile:'tls/application.pem',keyFile:'tls/application.key'},0o644);
write(join(consoleDirectory,'console-tls.json'),{certFile:'console.pem',keyFile:'console.key'},0o644);
write(join(engineDirectory,'service.json'),{host:'0.0.0.0',port:3100,tls:{caFile:'tls/ca.pem',certFile:'tls/engine.pem',keyFile:'tls/engine.key',clientPinFile:'tls/application.pem'},auditFile:'/audit/sampling.jsonl',custody:{keyStore:'/custody/keys',keyEscrow:'/custody/escrow'},postgresExtension:'/work/tmp/duckdb-extensions/postgres_scanner.duckdb_extension',postgresReadinessSource:'secret://acceptance/source',limits:sourceLimits},0o644);
write(join(gatewayDirectory,'postgres-password'),password+'\n',0o644);
write(join(gatewayDirectory,'redis.conf'),`bind 0.0.0.0\nprotected-mode yes\nsave ""\nappendonly no\nrequirepass ${password}\n`,0o644);
const runtimeEnv=join(gatewayDirectory,'runtime.env'),operatorEnv=join(gatewayDirectory,'operator.env'),spiceEnv=join(gatewayDirectory,'spicedb.env'),engineEnv=join(engineDirectory,'runtime.env');
const outputDirectory=join(directory,'output');mkdirSync(outputDirectory,{mode:0o700});
const provider=Object.fromEntries(Object.entries(xq).filter(([key])=>key.startsWith('OPINTEL_XQ_')&&!key.startsWith('OPINTEL_XQ_TEST_')||key==='OPINTEL_CUSTODY_MASTER_KEY'));
const common={...provider,OPINTEL_API_BASE_URL:`https://${hostAddress}:14873`,DATABASE_URL:`postgresql://opintel_gateway:${runtimePassword}@postgres:5432/opintel`,REDIS_URL:`redis://:${password}@redis:6379`,SPICEDB_ENDPOINT:'spicedb:50051',SPICEDB_TOKEN:spiceToken,APP_BASE_URL:'https://127.0.0.1:14873',OPINTEL_STAGE4_SMOKE:'synthetic-only',OPINTEL_SECRET_ACCEPTANCE_SOURCE:sourceUrl};
envFile(runtimeEnv,common);envFile(operatorEnv,{...common,MIGRATION_DATABASE_URL:`postgresql://opintel:${password}@postgres:5432/opintel`,APPLICATION_TLS_CONFIG:'/config/application-tls.json',OPINTEL_OPERATOR_CONFIG:'/output/operator.json',OPINTEL_PROVISION_MANIFEST:'/output/provision.json',OPINTEL_SOAK_MANIFEST:'/output/soak.json',OPINTEL_SEED_MANIFEST:'/output/seed.json',OPINTEL_OBSERVER_COOKIE:'/output/observer.cookie',OPINTEL_API_BASE_URL:`https://${hostAddress}:14873`,OPINTEL_DEMO_DATABASE_URL:sourceUrl,OPINTEL_DEMO_FIXTURE:'V-01',OPINTEL_DEMO_SEED:'1',OPINTEL_DEMO_SCHEMAS:'soak_policies,soak_claims,soak_recoveries',OPINTEL_CERTIFICATES:'/output/certificates.json',OPINTEL_SOAK_DURATION:'120',OPINTEL_SOAK_RATE:String(soakRateMs)});
envFile(spiceEnv,{SPICEDB_GRPC_PRESHARED_KEY:spiceToken,SPICEDB_DATASTORE_CONN_URI:`postgres://spicedb:${password}@spicedb-postgres:5432/spicedb?sslmode=disable`,SPICEDB_GRPC_TLS_CERT_PATH:'/config/tls/spicedb.pem',SPICEDB_GRPC_TLS_KEY_PATH:'/config/tls/spicedb.key'});
envFile(engineEnv,{OPINTEL_SECRET_ACCEPTANCE_SOURCE:sourceUrl,UV_THREADPOOL_SIZE:String(engineWorkers)});
const gatewayFile=join(gatewayDirectory,'package.env'),engineFile=join(engineDirectory,'package.env');
envFile(gatewayFile,{PLATFORM:platform,GATEWAY_API_IMAGE:images.api,GATEWAY_CONSOLE_IMAGE:images.console,GATEWAY_MIGRATIONS_IMAGE:images.migrations,GATEWAY_PROVISIONING_IMAGE:images.provisioning,GATEWAY_CONFIG_DIRECTORY:gatewayDirectory,GATEWAY_CONSOLE_CONFIG_DIRECTORY:consoleDirectory,GATEWAY_XQ_DIRECTORY:join(gatewayDirectory,'xq'),GATEWAY_AGENT_CERTIFICATES_DIRECTORY:join(homedir(),'.xq'),GATEWAY_OPERATOR_UID:process.getuid(),GATEWAY_OPERATOR_GID:process.getgid(),GATEWAY_OPERATOR_OUTPUT_DIRECTORY:outputDirectory,GATEWAY_DEMO_TOOLS_IMAGE:images['demo-tools'],GATEWAY_POSTGRES_PASSWORD_FILE:join(gatewayDirectory,'postgres-password'),GATEWAY_SPICEDB_POSTGRES_PASSWORD_FILE:join(gatewayDirectory,'postgres-password'),GATEWAY_REDIS_CONFIG_FILE:join(gatewayDirectory,'redis.conf'),GATEWAY_API_ENV_FILE:runtimeEnv,GATEWAY_OPERATOR_ENV_FILE:operatorEnv,GATEWAY_SPICEDB_ENV_FILE:spiceEnv,GATEWAY_INGRESS_CERT_FILE:join(consoleDirectory,'console.pem'),GATEWAY_INGRESS_KEY_FILE:join(consoleDirectory,'console.key'),GATEWAY_INGRESS_CONFIG_FILE:join(packages,'gateway','ingress','nginx.conf'),SMTP_HOST:'mailpit',SMTP_PORT:'1025',SMTP_USER:'',SMTP_PASSWORD:'',SMTP_SENDER:'acceptance@example.invalid',SMTP_TLS_MODE:'starttls',GATEWAY_POSTGRES_PORT:16432,GATEWAY_SPICEDB_POSTGRES_PORT:16433,GATEWAY_REDIS_PORT:17379,GATEWAY_SPICEDB_PORT:16051,GATEWAY_API_PORT:14800,GATEWAY_CONSOLE_PORT:14873,GATEWAY_CONSOLE_BIND_ADDRESS:'0.0.0.0',GATEWAY_RECEIPT_PORT:14811,GATEWAY_RECEIPT_BIND_ADDRESS:'0.0.0.0',GATEWAY_HEARTBEAT_PORT:14812,GATEWAY_HEARTBEAT_BIND_ADDRESS:'0.0.0.0',GATEWAY_HEARTBEAT_URL:`https://${hostAddress}:14812`});
envFile(engineFile,{PLATFORM:platform,ENGINE_IMAGE:images.engine,ENGINE_EGRESS_IMAGE:images.egress,ENGINE_CONFIG_DIRECTORY:engineDirectory,ENGINE_STATE_DIRECTORY:join(engineDirectory,'state'),ENGINE_ENV_FILE:engineEnv,ENGINE_AUDIT_DIRECTORY:join(engineDirectory,'audit'),ENGINE_CUSTODY_DIRECTORY:join(engineDirectory,'custody'),ENGINE_INGEST_DIRECTORY:join(engineDirectory,'ingest'),ENGINE_XQ_DIRECTORY:join(engineDirectory,'xq'),ENGINE_PORT:14810,ENGINE_BIND_ADDRESS:'0.0.0.0'});
const mailFile=join(directory,'mailpit.json');write(mailFile,{services:{mailpit:{image:upstream['x-acceptance-images'].mailpit,platform,environment:{MP_SMTP_TLS_CERT:'/tls/mailpit.pem',MP_SMTP_TLS_KEY:'/tls/mailpit.key',MP_SMTP_REQUIRE_STARTTLS:'true'},volumes:[join(gatewayDirectory,'tls')+':/tls:ro'],ports:['0.0.0.0:14825:8025']}}});
const sourceFile=join(directory,'source.json');write(sourceFile,{services:{source:{image:upstream.services.postgres.image,platform,environment:{POSTGRES_USER:'source',POSTGRES_PASSWORD:password,POSTGRES_DB:'source'},volumes:['source-data:/var/lib/postgresql/data'],ports:['0.0.0.0:16435:5432'],healthcheck:{test:['CMD','pg_isready','-U','source'],interval:'1s',timeout:'2s',retries:30}}},volumes:{'source-data':{}}});
const gateway=(...args)=>exec('bash',[join(packages,'gateway','gateway.sh'),'--env-file',gatewayFile,'--project-name',gatewayProject,...args]);
const engine=(...args)=>exec('bash',[join(packages,'engine','engine.sh'),'--env-file',engineFile,'--project-name',engineProject,...args]);
const source=(...args)=>exec('docker',['compose','-p',sourceProject,'-f',sourceFile,...args]);
const gatewayCompose=(service,...args)=>exec('docker',['compose','-p',gatewayProject,'--env-file',gatewayFile,'-f',join(packages,'gateway','services',service+'.json'),...args]);
async function wait(check,label,timeout=90000){const until=Date.now()+timeout;for(;;){try{return await check();}catch{if(Date.now()>until)throw new Error(label+' did not become ready');await setTimeout(500);}}}
const ca=readFileSync(join(directory,'ca.pem'));
let cookie='';
function https(url,method='GET',body,tls={}){return new Promise((resolve,reject)=>{
 const parsed=new URL(url),call=request(parsed,{method,agent:false,signal:globalThis.AbortSignal.timeout(5000),ca,...tls,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},timeout:5000},response=>{let text='';response.on('data',chunk=>{text+=chunk;});response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text}));});
 call.on('error',error=>{appendFileSync(join(directory,'transport.jsonl'),JSON.stringify({method,path:parsed.pathname,code:error.code,reusedSocket:call.reusedSocket,at:new Date().toISOString()})+'\n');reject(error);});call.on('timeout',()=>call.destroy(new Error('HTTPS deadline')));call.end(body?JSON.stringify(body):undefined);
});}
async function api(path,method='GET',body){const response=await https('https://127.0.0.1:14873'+path,method,body);if(response.status<200||response.status>=300)throw new Error(`API ${method} ${path} refused (${response.status})`);return response.text?JSON.parse(response.text):undefined;}
const health=async()=>{const response=await https('https://127.0.0.1:14810/health','POST',undefined,{cert:readFileSync(join(gatewayDirectory,'tls','application.pem')),key:readFileSync(join(gatewayDirectory,'tls','application.key'))});assert.equal(response.status,200);return JSON.parse(response.text);};
function mailJson(path){return new Promise((resolve,reject)=>{const call=httpRequest('http://127.0.0.1:14825'+path,{agent:false,timeout:5000},response=>{let text='';response.on('data',chunk=>{text+=chunk;});response.on('error',()=>reject(new Error('Mail catcher response failed')));response.on('end',()=>{try{assert.equal(response.statusCode,200);resolve(JSON.parse(text));}catch{reject(new Error('Mail catcher response invalid'));}});});call.on('error',()=>reject(new Error('Mail catcher unavailable')));call.on('timeout',()=>call.destroy(new Error('Mail catcher deadline')));call.end();});}
async function mailMessages(){return (await mailJson('/api/v1/messages')).messages;}
async function receivedMail(email,before){return wait(async()=>{const found=(await mailMessages()).find(m=>!before.has(m.ID)&&m.To.some(to=>to.Address===email));assert.ok(found);return mailJson('/api/v1/message/'+found.ID);},'SMTP delivery');}

async function login(){
 cookie='';const before=new Set((await mailMessages()).map(m=>m.ID));
 await api('/api/v1/auth/request-link','POST',{email:'stage4-owner@example.invalid',deviceNonce:'stage4-browser'});
 const mail=await receivedMail('stage4-owner@example.invalid',before),link=mail.Text.match(/https:\/\/[^\s<>]+/u)?.[0];assert.ok(link);
 const callback=await https('https://127.0.0.1:14873/api/v1/auth/callback','POST',{token:new URL(link).searchParams.get('token'),deviceNonce:'stage4-browser'});
 assert.equal(callback.status,200);assert.ok(callback.headers['set-cookie']?.[0]);cookie=callback.headers['set-cookie'][0].split(';')[0];
}
function browserCheck(restore=false){
 const version=JSON.parse(readFileSync('package-lock.json','utf8')).packages['node_modules/@playwright/test'].version;
 exec('docker',['run','--rm','--init','--ipc=host','--platform',platform,'-v',resolve('node_modules')+':/work/node_modules:ro','-v',resolve('scripts/images/package-browser.mjs')+':/work/browser.mjs:ro','-v',directory+':/acceptance','-w','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs',...(restore?['restore']:[])]);
 return JSON.parse(readFileSync(join(directory,'browser-'+(restore?'restored':'initial')+'.json'),'utf8'));
}

const result={platform,tag,revision:published?.revision??exec('git',['rev-parse','HEAD']),published:!!published,candidate:published?.candidate??true,images,upstreamImages:{ingress:upstream.services.ingress.image,mailpit:upstream['x-acceptance-images'].mailpit},hostAddress,workload:{agents:10,rateMs:soakRateMs,sourceLimits,engineWorkers},projects:{gateway:gatewayProject,engine:engineProject,source:sourceProject},checks:{}};
try{
 source('up','-d','--wait');
 exec('docker',['compose','-p',gatewayProject,'-f',mailFile,'up','-d']);await wait(mailMessages,'Mail catcher');
 gateway('start','postgres','redis','spicedb-postgres');
 await wait(()=>gatewayCompose('postgres','exec','-T','postgres','pg_isready','-U','opintel'),'Gateway PostgreSQL');
 await wait(()=>gatewayCompose('spicedb-postgres','exec','-T','spicedb-postgres','pg_isready','-U','spicedb'),'SpiceDB PostgreSQL');
 gateway('migrate','up');gateway('spicedb-migrate');gateway('start','spicedb');await wait(()=>gateway('schema'),'Authorization schema');
 gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-c',`CREATE ROLE opintel_gateway LOGIN PASSWORD '${runtimePassword}'; GRANT opintel_app,opintel_platform,opintel_platform_admin TO opintel_gateway;`);
 gateway('owner-claim','--owner-email','stage4-owner@example.invalid','--company','Stage4 synthetic acceptance','--region','eu-west-1');
 assert.equal(gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-Atc','SELECT count(*) FROM company'),'0');
 gateway('start','api','console','ingress');await wait(()=>api('/healthz'),'Gateway API');await login();
 const companies=await api('/api/v1/companies');assert.equal(companies.items.length,1);write(join(outputDirectory,'observer.cookie'),cookie+'\n');
 result.checks.daemonHealth={};
 for(const service of ['api','console','ingress','postgres','redis','spicedb-postgres','spicedb']){
  const container=exec('docker',['ps','-q','--filter',`label=com.docker.compose.project=${gatewayProject}`,'--filter',`label=com.docker.compose.service=${service}`]);assert.ok(container);
  await wait(()=>assert.equal(exec('docker',['inspect','--format','{{.State.Health.Status}}',container]),'healthy'),'Gateway health '+service);
  result.checks.daemonHealth[service]='healthy';
 }
 result.checks.ownerClaim={normalLogin:true,noCompanyBeforeLogin:true,companyCount:1};
 result.checks.ingressTls={suppliedCertificate:true,pairedPaths:true,fallbackWarning:(await https('https://127.0.0.1:14873/deployment.json')).text};
 engine('prepare',join(engineDirectory,'state','readiness-egress.json'));engine('start','egress');engine('start','engine');await wait(health,'Packaged engine');
 write(join(outputDirectory,'operator.json'),{ownerEmail:'stage4-owner@example.invalid',companyId:companies.items[0].id,projectName:'Stage4 reinsurance',region:'eu-west-1',engine:{name:'Acceptance engine',address:`https://${hostAddress}:14810`,certificatePin:new X509Certificate(readFileSync(join(engineDirectory,'tls','engine.pem'))).fingerprint256.replaceAll(':','')},sourceCredentialRef:'secret://acceptance/source',settings:{query:{rowLimit:1000,timeoutSeconds:30,memoryLimitMb:256,concurrencyPerPool:2,aggregateMinGroupSize:5},custody:{provider:'xq',tenant:xq.OPINTEL_XQ_TEAM_ID,region:'eu-west-1'},poolKeyGraceSeconds:3600}});
 write(join(outputDirectory,'certificates.json'),[{certificateId:223,deviceName:'opintelprobe'},{certificateId:224,deviceName:'opintelpoola'},{certificateId:225,deviceName:'opintelpoolb2'},{certificateId:226,deviceName:'opintelpoolb'}].map(v=>({...v,bundlePath:'/home/operator/.xq/v02/'+v.certificateId})));
 const job=(command,...args)=>{const text=gateway(command,...args);write(join(directory,command+'-'+args.join('-')+'-'+Date.now()+'.log'),text);return text;};
 job('provision');result.checks.provision=true;
 const provision=JSON.parse(readFileSync(join(outputDirectory,'provision.json'),'utf8')),email='browser-acceptance@example.invalid';
 const beforeInvitation=new Set((await mailMessages()).map(m=>m.ID));
 await api('/api/v1/projects/'+provision.projectId+'/invitations','POST',{email,companyId:companies.items[0].id,projectId:provision.projectId,role:'viewer'});
 await receivedMail(email,beforeInvitation);result.checks.smtpInvitation={delivered:true};
 write(join(directory,'browser.json'),{base:`https://${hostAddress}:14873`,mail:`http://${hostAddress}:14825`,email,projectId:provision.projectId});
 result.checks.packagedBrowser=browserCheck();
 job('demo-tools','seed');result.checks.seed=true;
 job('demo-tools','xq-check');result.checks.packagedApiXqConnection=JSON.parse(readFileSync(join(outputDirectory,readdirSync(outputDirectory).find(name=>name.startsWith('xq-check-'))),'utf8'));
 job('demo-tools','governance');result.checks.governance=true;
 const blocked=createServer(socket=>socket.end());await new Promise(resolve=>blocked.listen(14899,'0.0.0.0',resolve));
 try{
  const probe=`const s=require('node:net').connect(14899,${JSON.stringify(hostAddress)});s.setTimeout(1500);s.on('connect',()=>{s.end();process.exit(0)});s.on('timeout',()=>process.exit(2));s.on('error',()=>process.exit(3));`;
  exec('docker',['run','--rm','--platform',platform,images.api,'node','-e',probe]);
  const container=exec('docker',['ps','-q','--filter',`label=com.docker.compose.project=${engineProject}`,'--filter','label=com.docker.compose.service=engine']);assert.ok(container);
  const denied=spawnSync('docker',['exec',container,'node','-e',probe],{encoding:'utf8',timeout:10000});assert.equal(denied.status,2);result.checks.egressDenial={positiveControl:true,undeclaredDestinationDenied:true};
 }finally{await new Promise(resolve=>blocked.close(resolve));}
 const sql=`SELECT json_build_object('projects',(SELECT json_agg(p ORDER BY id) FROM project p),'sources',(SELECT json_agg(s ORDER BY id) FROM data_source s),'pools',(SELECT json_agg(p ORDER BY id) FROM pool p),'credentials',(SELECT json_agg(c ORDER BY id) FROM pool_credential c),'keys',(SELECT json_agg(k ORDER BY id) FROM pool_key k),'decisions',(SELECT json_agg(t ORDER BY pool_id,element_id) FROM entitlement t),'rows',(SELECT json_agg(r ORDER BY id) FROM row_entitlement r))`;
 const snapshot=()=>gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-Atc',sql);
 const before=snapshot(),keysBefore=readFileSync(join(outputDirectory,'soak.json'),'utf8');
 job('provision');job('demo-tools','seed');job('demo-tools','governance');assert.equal(snapshot(),before);assert.equal(readFileSync(join(outputDirectory,'soak.json'),'utf8'),keysBefore);result.checks.unchangedRerun={stateHash:createHash('sha256').update(before).digest('hex'),privateManifestHash:createHash('sha256').update(keysBefore).digest('hex'),identical:true};
 job('demo-tools','lifecycle');job('demo-tools','prepare');const preparation=JSON.parse(readFileSync(join(outputDirectory,readdirSync(outputDirectory).find(name=>name.startsWith('prepare-'))),'utf8'));assert.equal(preparation.status,'passed');result.checks.certificateExchangeAndEscrowRedeem={certificates:preparation.certificates,verifiedValues:preparation.verifiedValues,receiptIds:preparation.receiptIds};result.checks.prepare=true;
 // Keep the timer and verification live while the static console is stopped.
 const soakLog=join(directory,'demo-tools-soak.log');
 const soakDirectory=()=>join(outputDirectory,readdirSync(outputDirectory).find(n=>n.startsWith('soak-run-'))??'not-started','soak');
 const child=spawn('bash',[join(packages,'gateway','gateway.sh'),'--env-file',gatewayFile,'--project-name',gatewayProject,'demo-tools','run-soak','120'],{stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>appendFileSync(soakLog,chunk,{mode:0o600}));child.stderr.on('data',chunk=>appendFileSync(soakLog,chunk,{mode:0o600}));
 let soakExitCode=null;
 const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
 try{
  await wait(()=>{const paths=readdirSync(soakDirectory()).filter(n=>n.endsWith('.jsonl'));assert.equal(paths.length,1);assert.ok(readFileSync(join(soakDirectory(),paths[0]),'utf8').includes('"type":"start"'));},'Timed soak start',300000);
  await setTimeout(15000);gateway('stop','console');const stoppedAt=new Date().toISOString();
  assert.equal((await https('https://127.0.0.1:14873/sign-in')).status,502);
  const readEvents=()=>{const name=readdirSync(soakDirectory()).find(n=>n.endsWith('.jsonl'));const text=readFileSync(join(soakDirectory(),name),'utf8');return text.slice(0,text.lastIndexOf('\n')).split('\n').filter(Boolean).map(line=>JSON.parse(line));};
  const baseline=readEvents(),oldQueries=new Set(baseline.filter(e=>e.type==='query').map(e=>e.response?.structuredContent?.evidenceId)),oldReceipts=new Set(baseline.filter(e=>e.type==='receipt').map(e=>e.id)),verifiedDuringOutage=new Set();
  const probes=[];for(let n=0;n<4;n++){
   await api('/healthz');await api('/api/v1/projects/'+provision.projectId+'/runs?limit=1');
   const events=readEvents(),newQueries=new Set(events.filter(e=>e.type==='query'&&e.outcome==='success'&&!oldQueries.has(e.response?.structuredContent?.evidenceId)).map(e=>e.response?.structuredContent?.evidenceId));
   for(const event of events)if(event.type==='receipt'&&!oldReceipts.has(event.id)&&newQueries.has(event.id))verifiedDuringOutage.add(event.id);
   probes.push({at:new Date().toISOString(),newVerifiedQueries:verifiedDuringOutage.size});await setTimeout(5000);
  }
  const resumedAt=new Date().toISOString();gateway('start','console');await wait(async()=>assert.equal((await https('https://127.0.0.1:14873/sign-in')).status,200),'Console recovery');
  result.checks.consoleIsolation={stoppedAt,resumedAt,apiAndReceiptProbes:probes,queryAndReceiptDuringOutage:verifiedDuringOutage.size,uiUnavailableOnly:true};
  result.checks.packagedBrowserRestored=browserCheck(true);
  soakExitCode=await finished;
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await finished;}}

 const logs=readdirSync(soakDirectory()).filter(n=>n.endsWith('.jsonl'));assert.equal(logs.length,1);const events=readFileSync(join(soakDirectory(),logs[0]),'utf8').trim().split('\n').map(v=>JSON.parse(v));const start=events.find(v=>v.type==='start'),summary=events.at(-1);
 const apiLog=gatewayCompose('api','logs','--no-color','api');result.checks.engineProbeRecovery={connectRetries:[...apiLog.matchAll(/engine\.probe_connect_retry/gu)].length,verificationRefusals:[...apiLog.matchAll(/engine\.verification_refused/gu)].length};
 result.checks.twoMinuteSoak={outcomes:summary.outcomes,refusals:summary.refusals,durationSeconds:start.duration,status:summary.status,invariantBreaches:summary.invariantBreaches,operationalErrors:summary.operationalErrors,receiptChecksSkipped:summary.receiptInvariants.checksSkipped,custodyVerifiedValues:summary.custody.verifiedValues,coverage:{declared:summary.coverage.declared,exercised:summary.coverage.exercised}};
 result.checks.packagedSoakWorkflow=JSON.parse(readFileSync(join(soakDirectory(),'..','result.json'),'utf8')).steps;
 const outage=result.checks.consoleIsolation;
 const receipts=events.filter(e=>e.type==='receipt'&&e.detail&&Date.parse(e.detail.startedAt)>=Date.parse(outage.stoppedAt)&&Date.parse(e.detail.startedAt)<Date.parse(outage.resumedAt));
 assert.ok(receipts.length,'No verified query receipts during console outage');outage.verifiedQueryReceipts=receipts.length;
 assert.ok(outage.queryAndReceiptDuringOutage>0,'No new successful query and receipt verified while console was stopped');
 assert.equal(soakExitCode,0,'Packaged soak failed');assert.equal(start.duration,120);assert.ok(Date.now()-Date.parse(start.startedAt)>=120000);assert.equal(summary.status,'PASSED');assert.equal(summary.invariantBreaches,0);assert.equal(summary.operationalErrors,0);assert.equal(summary.receiptInvariants.checksSkipped,0);assert.ok(summary.custody.verifiedValues>0);
 result.status='passed';write(join(directory,'result.json'),result);console.log('Stage4 package acceptance passed: '+join(directory,'result.json'));
}catch(error){result.status='failed';result.failure=error instanceof Error?error.message:'Acceptance failed';write(join(directory,'result.json'),result);throw error;}
finally{
 if(process.env.STAGE4_KEEP_RUNNING!=='1')for(const project of [gatewayProject,engineProject,sourceProject]){
  const containers=exec('docker',['ps','-aq','--filter',`label=com.docker.compose.project=${project}`]);
  if(containers){const ids=containers.split('\n');write(join(directory,project+'.log'),ids.map(container=>spawnSync('docker',['logs',container],{encoding:'utf8'})).map(log=>log.stdout+log.stderr).join('\n'));exec('docker',['stop',...ids]);exec('docker',['rm',...ids]);}
  const networks=exec('docker',['network','ls','--filter',`label=com.docker.compose.project=${project}`,'--format','{{.ID}}']);if(networks)exec('docker',['network','rm',...networks.split('\n')]);
 }
}
