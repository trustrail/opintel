import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,appendFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID,X509Certificate} from 'node:crypto';
import {request} from 'node:https';
import {createServer} from 'node:net';
import {setTimeout} from 'node:timers/promises';
import {URL} from 'node:url';
import {build} from 'esbuild';
import {packageDeployment} from './package.mjs';
import {configureIngest} from './stage3-ingest-proof.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// External synthetic acceptance only. Nothing here is copied into product images.
const platform=process.env.PLATFORM??'linux/amd64';
const ingestEnabled=process.env.INGEST==='1',fixtureSourceId=randomUUID();
if(platform!=='linux/amd64')throw new Error('This host acceptance run is AMD64 only.');
function exec(command,args,options={}){
 const result=spawnSync(command,args,{encoding:'utf8',timeout:120000,...options});
 if(result.error||result.status!==0)throw new Error(`${command} failed (${result.status}): ${result.stderr??''}`);
 return result.stdout.trim();
}
const tag=process.env.TAG??'candidate-stage3-core',directory=resolve(mkdtempSync('tmp/stage3-acceptance-'));
const gatewayProject='opintel-gateway-proof-'+Date.now(),engineProject='opintel-engine-proof-'+Date.now(),sourceProject='opintel-source-proof-'+Date.now();
const gatewayDirectory=join(directory,'gateway'),engineDirectory=join(directory,'engine'),consoleDirectory=join(directory,'console');
for(const path of [gatewayDirectory,engineDirectory,consoleDirectory,...[gatewayDirectory,engineDirectory].map(d=>join(d,'tls')),join(engineDirectory,'audit'),join(engineDirectory,'custody'),join(engineDirectory,'ingest'),join(engineDirectory,'state'),join(engineDirectory,'xq'),join(gatewayDirectory,'xq')])mkdirSync(path,{recursive:true});
for(const name of ['audit','custody','ingest'])chmodSync(join(engineDirectory,name),0o777);
const write=(file,value,mode=0o600)=>writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode});
const envFile=(file,values)=>write(file,Object.entries(values).map(([name,value])=>`${name}=${value}`).join('\n')+'\n');
const published=process.env.RELEASE_MANIFEST?JSON.parse(readFileSync(process.env.RELEASE_MANIFEST,'utf8')):undefined;
const images={};for(const name of ['api','console','engine','egress','migrations','provisioning']){
 const records=published?.artifacts.filter(value=>value.target===name&&value.platform===platform);
 if(records&&records.length!==1)throw new Error('Published artifact missing or ambiguous: '+name);
 const ref=records?.[0]?.repoDigests?.[0];
 if(ref){assert.match(ref,new RegExp(`^ghcr.io/trustrail/opintel-${name}@sha256:[a-f0-9]{64}$`,'u'));exec('docker',['pull','--platform',platform,ref]);}
 const info=JSON.parse(exec('docker',['image','inspect','--platform',platform,ref??`opintel-${name}:${tag}-linux-amd64`]))[0];
 const digest=ref??info.RepoDigests?.find(value=>value.startsWith(`opintel-${name}@sha256:`));if(!digest)throw new Error('Missing audited image digest: '+name);images[name]=digest;
}
const hostAddress=exec('docker',['run','--rm','--platform',platform,images.api,'node','-e',"require('node:dns').lookup('host.docker.internal',{family:4},(error,value)=>{if(error)process.exit(1);console.log(value);})"]);
assert.match(hostAddress,/^\d+\.\d+\.\d+\.\d+$/u);
const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
const packages=join(directory,'packages');
packageDeployment(published??{revision:exec('git',['rev-parse','HEAD']),candidate:true,dirty:true,upstream,artifacts:Object.entries(images).map(([target,digest])=>({target,platform,repoDigests:[digest]}))},packages,platform,{candidate:true});
const password=randomBytes(24).toString('hex'),runtimePassword=randomBytes(24).toString('hex'),spiceToken=randomBytes(24).toString('hex');
const sourceUrl=`postgresql://source:${password}@${hostAddress}:15435/source`;
exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'ca.key'),'-out',join(directory,'ca.pem'),'-subj','/CN=Disposable stage3 CA','-days','2']);
function certificate(name,output,sans){
 exec('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(output,name+'.key'),'-out',join(directory,name+'.csr'),'-subj',`/CN=${name}`]);
 write(join(directory,name+'.ext'),`subjectAltName=${sans}\nextendedKeyUsage=serverAuth,clientAuth\n`);
 exec('openssl',['x509','-req','-in',join(directory,name+'.csr'),'-CA',join(directory,'ca.pem'),'-CAkey',join(directory,'ca.key'),'-CAcreateserial','-out',join(output,name+'.pem'),'-days','2','-extfile',join(directory,name+'.ext')]);
 chmodSync(join(output,name+'.key'),0o644); // Disposable synthetic identities only.
}
certificate('application',join(gatewayDirectory,'tls'),`DNS:localhost,IP:127.0.0.1,IP:${hostAddress}`);
certificate('spicedb',join(gatewayDirectory,'tls'),'DNS:spicedb,DNS:localhost,IP:127.0.0.1');
certificate('engine',join(engineDirectory,'tls'),`DNS:localhost,IP:127.0.0.1,IP:${hostAddress}`);
certificate('console',consoleDirectory,'DNS:localhost,IP:127.0.0.1');
for(const output of [join(gatewayDirectory,'tls'),join(engineDirectory,'tls')])write(join(output,'ca.pem'),readFileSync(join(directory,'ca.pem'),'utf8'),0o644);
write(join(engineDirectory,'tls','application.pem'),readFileSync(join(gatewayDirectory,'tls','application.pem'),'utf8'),0o644);
write(join(gatewayDirectory,'application-tls.json'),{caFile:'tls/ca.pem',certFile:'tls/application.pem',keyFile:'tls/application.key'},0o644);
write(join(consoleDirectory,'console-tls.json'),{certFile:'console.pem',keyFile:'console.key'},0o644);
write(join(engineDirectory,'service.json'),{host:'0.0.0.0',port:3100,tls:{caFile:'tls/ca.pem',certFile:'tls/engine.pem',keyFile:'tls/engine.key',clientPinFile:'tls/application.pem'},auditFile:'/audit/sampling.jsonl',custody:{keyStore:'/custody/keys',keyEscrow:'/custody/escrow'},postgresExtension:'/work/tmp/duckdb-extensions/postgres_scanner.duckdb_extension',postgresReadinessSource:'secret://acceptance/source',limits:{maxConnectionsPerSource:2,statementTimeoutMs:8000,operationTimeoutMs:9000}},0o644);
write(join(gatewayDirectory,'postgres-password'),password+'\n',0o644);
write(join(gatewayDirectory,'redis.conf'),`bind 0.0.0.0\nprotected-mode yes\nsave ""\nappendonly no\nrequirepass ${password}\n`,0o644);
const runtimeEnv=join(gatewayDirectory,'runtime.env'),operatorEnv=join(gatewayDirectory,'operator.env'),spiceEnv=join(gatewayDirectory,'spicedb.env'),engineEnv=join(engineDirectory,'runtime.env');
const common={DATABASE_URL:`postgresql://opintel_gateway:${runtimePassword}@postgres:5432/opintel`,REDIS_URL:`redis://:${password}@redis:6379`,SPICEDB_ENDPOINT:'spicedb:50051',SPICEDB_TOKEN:spiceToken,APP_BASE_URL:'https://127.0.0.1:13873',OPINTEL_STAGE3_SMOKE:'synthetic-only'};
envFile(runtimeEnv,common);envFile(operatorEnv,{...common,MIGRATION_DATABASE_URL:`postgresql://opintel:${password}@postgres:5432/opintel`});
envFile(spiceEnv,{SPICEDB_GRPC_PRESHARED_KEY:spiceToken,SPICEDB_DATASTORE_CONN_URI:`postgres://spicedb:${password}@spicedb-postgres:5432/spicedb?sslmode=disable`,SPICEDB_GRPC_TLS_CERT_PATH:'/config/tls/spicedb.pem',SPICEDB_GRPC_TLS_KEY_PATH:'/config/tls/spicedb.key'});
envFile(engineEnv,{OPINTEL_SECRET_ACCEPTANCE_SOURCE:sourceUrl});
const gatewayFile=join(gatewayDirectory,'package.env'),engineFile=join(engineDirectory,'package.env');
envFile(gatewayFile,{PLATFORM:platform,GATEWAY_API_IMAGE:images.api,GATEWAY_CONSOLE_IMAGE:images.console,GATEWAY_MIGRATIONS_IMAGE:images.migrations,GATEWAY_PROVISIONING_IMAGE:images.provisioning,GATEWAY_CONFIG_DIRECTORY:gatewayDirectory,GATEWAY_CONSOLE_CONFIG_DIRECTORY:consoleDirectory,GATEWAY_XQ_DIRECTORY:join(gatewayDirectory,'xq'),GATEWAY_POSTGRES_PASSWORD_FILE:join(gatewayDirectory,'postgres-password'),GATEWAY_SPICEDB_POSTGRES_PASSWORD_FILE:join(gatewayDirectory,'postgres-password'),GATEWAY_REDIS_CONFIG_FILE:join(gatewayDirectory,'redis.conf'),GATEWAY_API_ENV_FILE:runtimeEnv,GATEWAY_OPERATOR_ENV_FILE:operatorEnv,GATEWAY_SPICEDB_ENV_FILE:spiceEnv,GATEWAY_API_UPSTREAM:'http://api:3000',GATEWAY_POSTGRES_PORT:15432,GATEWAY_SPICEDB_POSTGRES_PORT:15433,GATEWAY_REDIS_PORT:16379,GATEWAY_SPICEDB_PORT:15051,GATEWAY_API_PORT:13800,GATEWAY_CONSOLE_PORT:13873,GATEWAY_RECEIPT_PORT:13811,GATEWAY_RECEIPT_BIND_ADDRESS:'0.0.0.0',GATEWAY_HEARTBEAT_PORT:13812,GATEWAY_HEARTBEAT_BIND_ADDRESS:'0.0.0.0',GATEWAY_HEARTBEAT_URL:`https://${hostAddress}:13812`});
envFile(engineFile,{PLATFORM:platform,ENGINE_IMAGE:images.engine,ENGINE_EGRESS_IMAGE:images.egress,ENGINE_CONFIG_DIRECTORY:engineDirectory,ENGINE_STATE_DIRECTORY:join(engineDirectory,'state'),ENGINE_ENV_FILE:engineEnv,ENGINE_AUDIT_DIRECTORY:join(engineDirectory,'audit'),ENGINE_CUSTODY_DIRECTORY:join(engineDirectory,'custody'),ENGINE_INGEST_DIRECTORY:join(engineDirectory,'ingest'),ENGINE_XQ_DIRECTORY:join(engineDirectory,'xq'),ENGINE_PORT:13810,ENGINE_BIND_ADDRESS:'0.0.0.0'});
const sourceFile=join(directory,'source.json');write(sourceFile,{services:{source:{image:upstream.services.postgres.image,platform,environment:{POSTGRES_USER:'source',POSTGRES_PASSWORD:password,POSTGRES_DB:'source'},ports:['0.0.0.0:15435:5432'],healthcheck:{test:['CMD','pg_isready','-U','source'],interval:'1s',timeout:'2s',retries:30}}}});
const gateway=(...args)=>exec('bash',[join(packages,'gateway','gateway.sh'),'--env-file',gatewayFile,'--project-name',gatewayProject,...args]);
const engine=(...args)=>exec('bash',[join(packages,'engine','engine.sh'),'--env-file',engineFile,'--project-name',engineProject,...args]);
const source=(...args)=>exec('docker',['compose','-p',sourceProject,'-f',sourceFile,...args]);
const gatewayCompose=(service,...args)=>exec('docker',['compose','-p',gatewayProject,'--env-file',gatewayFile,'-f',join(packages,'gateway','services',service+'.json'),...args]);
const id=(project,service)=>exec('docker',['ps','--filter',`label=com.docker.compose.project=${project}`,'--filter',`label=com.docker.compose.service=${service}`,'--format','{{.ID}}']);
async function wait(check,label){const until=Date.now()+90000;for(;;){try{return await check();}catch{if(Date.now()>until)throw new Error(label+' did not become ready');await setTimeout(500);}}}
const ca=readFileSync(join(directory,'ca.pem'));
let cookie='',mcp;
function https(url,method='GET',body,tls={}){return new Promise((resolve,reject)=>{
 const parsed=new URL(url),call=request(parsed,{method,agent:false,ca,...tls,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},timeout:5000},response=>{let text='';response.on('data',chunk=>{text+=chunk;});response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text}));});
 call.on('error',error=>{appendFileSync(join(directory,'transport.jsonl'),JSON.stringify({method,path:parsed.pathname,code:error.code,reusedSocket:call.reusedSocket,at:new Date().toISOString()})+'\n');reject(error);});call.on('timeout',()=>call.destroy(new Error('HTTPS deadline')));call.end(body?JSON.stringify(body):undefined);
});}
async function api(path,method='GET',body){const response=await https('https://127.0.0.1:13873'+path,method,body);if(response.status<200||response.status>=300)throw new Error(`API ${method} ${path} refused (${response.status})`);return response.text?JSON.parse(response.text):undefined;}
const health=async()=>{const response=await https('https://127.0.0.1:13810/health','POST',undefined,{cert:readFileSync(join(gatewayDirectory,'tls','application.pem')),key:readFileSync(join(gatewayDirectory,'tls','application.key'))});assert.equal(response.status,200);return JSON.parse(response.text);};
async function login(){
 cookie='';
 const previous=JSON.parse(gatewayCompose('api','exec','-T','api','node','-e',"console.log(JSON.stringify(require('node:fs').readdirSync('/mail')))"));
 await api('/api/v1/auth/request-link','POST',{email:'stage3-owner@example.invalid',deviceNonce:'stage3-browser'});
 const mail=JSON.parse(gatewayCompose('api','exec','-T','api','node','-e',`const fs=require('node:fs');const previous=${JSON.stringify(previous)};const messages=fs.readdirSync('/mail').filter(name=>!previous.includes(name)).map(name=>JSON.parse(fs.readFileSync('/mail/'+name)));process.stdout.write(JSON.stringify(messages.find(value=>value.template==='magic_link')));`));
 const callback=await https('https://127.0.0.1:13873/api/v1/auth/callback','POST',{token:new URL(mail.vars.url).searchParams.get('token'),deviceNonce:'stage3-browser'});
 assert.equal(callback.status,200);assert.ok(callback.headers['set-cookie']?.[0]);cookie=callback.headers['set-cookie'][0].split(';')[0];
}
const result={platform,tag,images,projects:{gateway:gatewayProject,engine:engineProject,source:sourceProject},checks:{}};
try{
 source('up','-d','--wait');
 source('exec','-T','source','psql','-U','source','-d','source','-c','CREATE SCHEMA image_smoke; CREATE TABLE image_smoke.records(answer integer); INSERT INTO image_smoke.records VALUES(42); ANALYZE image_smoke.records;');
 gateway('start','postgres','redis','spicedb-postgres');
 await wait(()=>gatewayCompose('postgres','exec','-T','postgres','pg_isready','-U','opintel'),'Gateway PostgreSQL');
 await wait(()=>gatewayCompose('spicedb-postgres','exec','-T','spicedb-postgres','pg_isready','-U','spicedb'),'SpiceDB PostgreSQL');
 gateway('migrate','up');gateway('migrate','up');gateway('spicedb-migrate');gateway('start','spicedb');
 await wait(()=>gateway('schema'),'Authorization schema');
 // Explicit DBA provisioning of a non-owner runtime login, separate from claims.
 gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-c',`CREATE ROLE opintel_gateway LOGIN PASSWORD '${runtimePassword}'; GRANT opintel_app,opintel_platform,opintel_platform_admin TO opintel_gateway;`);
 gateway('owner-claim','--owner-email','stage3-owner@example.invalid','--company','Stage3 synthetic acceptance','--region','eu-west-1');
 assert.equal(gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-Atc','SELECT count(*) FROM company'),'0');
 gateway('start','api','console');await wait(()=>api('/healthz'),'Gateway API');
 await login();
 const user=await api('/api/v1/auth/me'),companies=await api('/api/v1/companies'),industries=await api('/api/v1/industries');
 assert.equal(companies.items.length,1);
 const industry=(industries.items??industries).find(value=>value.slug==='general')??(industries.items??industries)[0];
 const project=await api('/api/v1/projects','POST',{companyId:companies.items[0].id,name:'Stage3 acceptance',industryId:industry.id,region:'eu-west-1'});
 await api(`/api/v1/projects/${project.id}/settings`,'PATCH',{agentHeartbeatSeconds:30,agentDisconnectGraceSeconds:60,query:{rowLimit:100,timeoutSeconds:30,memoryLimitMb:128,concurrencyPerPool:1,aggregateMinGroupSize:5}});
 result.checks.ownerClaim={noCompanyBeforeLogin:true,normalLogin:true,companyCount:1,audits:gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-Atc',"SELECT string_agg(action,',' ORDER BY action) FROM audit_entry WHERE action IN ('InstallationOwnerClaimCreated','InstallationOwnerClaimRedeemed')")};
 assert.equal(gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-Atc','SELECT count(*) FROM engine'),'0');
 const ingest=ingestEnabled?configureIngest(engineDirectory,project.id,fixtureSourceId,hostAddress):undefined;
 gateway('stop','api','console','postgres','redis','spicedb','spicedb-postgres');
 engine('prepare',join(engineDirectory,'state','readiness-egress.json'));engine('start','egress');engine('start','engine');
 const first=await wait(health,'Offline engine');
 assert.equal(existsSync(join(engineDirectory,'state','control','control.sock')),false);
 result.checks.abstractControl={noSocketFile:true};
 const engineId=id(engineProject,'engine');
 const worker=()=>exec('docker',['exec',engineId,'node','-e',`const fs=require('node:fs');const ids=fs.readdirSync('/proc').filter(name=>/^[0-9]+$/.test(name)&&Number(name)!==process.pid).filter(name=>{try{return fs.readFileSync('/proc/'+name+'/cmdline','utf8').includes('sidecar/start.js');}catch{return false;}});if(ids.length!==1)process.exit(1);console.log(ids[0]);`]);
 const pendingFiling=ingest?await ingest.arriveOffline(wait):undefined;
 const before=worker();exec('docker',['exec',engineId,'node','-e',`process.kill(${Number(before)},'SIGTERM')`]);
 const after=await wait(async()=>{const next=worker();assert.notEqual(next,before);await health();return next;},'Offline supervised replacement');
 if(ingest)await ingest.afterReplacement(wait,pendingFiling);
 result.checks.offlineEngine={contract:first.contract,gatewayStopped:true,registryEmpty:true,workerBefore:before,workerAfter:after};
 result.firewall=exec('docker',['exec',id(engineProject,'egress'),'iptables','-S','OUTPUT']);
 const blocked=createServer(socket=>socket.end());await new Promise(resolve=>blocked.listen(13899,'0.0.0.0',resolve));
 try{
  const probe=`const s=require('node:net').connect(13899,${JSON.stringify(hostAddress)});s.setTimeout(1500);s.on('connect',()=>{s.end();process.exit(0)});s.on('timeout',()=>process.exit(2));s.on('error',()=>process.exit(3));`;
  exec('docker',['run','--rm','--platform',platform,images.api,'node','-e',probe]);
  const denied=spawnSync('docker',['exec',engineId,'node','-e',probe],{encoding:'utf8',timeout:10000});assert.equal(denied.status,2);result.checks.egressDenial={positiveControl:true,undeclaredDestinationDenied:true};
 }finally{await new Promise(resolve=>blocked.close(resolve));}
 gateway('start','postgres','redis','spicedb-postgres');gateway('start','spicedb','api','console');await wait(()=>api('/healthz'),'Restarted gateway');await login();
 const pin=new X509Certificate(readFileSync(join(engineDirectory,'tls','engine.pem'))).fingerprint256;
 await api(`/api/v1/projects/${project.id}/engines`,'POST',{name:'Acceptance engine',address:`https://${hostAddress}:13810`,certificatePin:pin});
 const registered=(await api(`/api/v1/projects/${project.id}/engines`)).items[0];
 const wrongPin=(pin.startsWith('00')?'01':'00')+pin.slice(2);
 await api(`/api/v1/projects/${project.id}/engines/${registered.id}`,'PATCH',{name:'Acceptance engine',address:`https://${hostAddress}:13810`,certificatePin:wrongPin});
 const wrong=await https(`https://127.0.0.1:13873/api/v1/projects/${project.id}/engines/${registered.id}/verify`,'POST',{});
 assert.ok(wrong.status>=400);assert.equal(JSON.parse(wrong.text).error.code,'source_unavailable');
 const refused=(await api(`/api/v1/projects/${project.id}/engines`)).items.find(value=>value.id===registered.id);
 assert.equal(refused.verifiedAt,null);
 await api(`/api/v1/projects/${project.id}/engines/${registered.id}`,'PATCH',{name:'Acceptance engine',address:`https://${hostAddress}:13810`,certificatePin:pin});
 await api(`/api/v1/projects/${project.id}/engines/${registered.id}/verify`,'POST',{});
 result.checks.registration={wrongPinRefused:true,wrongPinClearsVerification:true,correctPinVerified:true};
 await api(`/api/v1/projects/${project.id}/engines/${registered.id}/custody`,'POST',{});
 await build({entryPoints:['scripts/images/stage3-seed.ts'],outfile:join(directory,'seed.mjs'),bundle:true,minify:true,sourcemap:false,platform:'node',format:'esm',target:'node22',banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},plugins:[{name:'acceptance-native',setup(builder){builder.onResolve({filter:/^@duckdb\/node-bindings$/},()=>({path:'native',namespace:'acceptance'}));builder.onLoad({filter:/.*/,namespace:'acceptance'},()=>({contents:'import {createRequire} from "node:module";export default createRequire(import.meta.url)("/work/native/duckdb.node");',loader:'js'}));}}]});
 gatewayCompose('api','run','--rm','--no-deps','--volume',`${join(directory,'seed.mjs')}:/acceptance/seed.mjs:ro`,'--env',`SMOKE_SOURCE_ID=${fixtureSourceId}`,'--env',`SMOKE_INGEST=${ingestEnabled?'1':'0'}`,'--env',`SMOKE_PROJECT_ID=${project.id}`,'--env',`SMOKE_USER_ID=${user.id}`,'api','node','/acceptance/seed.mjs');
 const fixture=JSON.parse(gatewayCompose('api','exec','-T','api','cat','/mail/stage3-fixture.json'));
 await api(`/api/v1/projects/${project.id}/sources/${fixture.sourceId}/engine`,'PATCH',{engineId:registered.id});
 await wait(()=>{const value=gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-Atc',`SELECT s.status='connected' AND NOT s.egress_pending AND e.egress_applied_version IS NOT NULL FROM data_source s JOIN engine e ON e.id=s.engine_id WHERE s.id='${fixture.sourceId}'`);assert.equal(value,'t');},'Applied egress acknowledgment and normal introspection');
 result.checks.heartbeat={appliedBeforeQuery:true};
 const heartbeatBody={projectId:project.id,engineId:registered.id,appliedVersion:null};
 const unknown=await https('https://127.0.0.1:13812/engine-heartbeat','POST',heartbeatBody,{cert:readFileSync(join(consoleDirectory,'console.pem')),key:readFileSync(join(consoleDirectory,'console.key'))});assert.equal(unknown.status,403);
 const cross=await https('https://127.0.0.1:13812/engine-heartbeat','POST',{...heartbeatBody,projectId:'00000000-0000-4000-8000-000000000099'},{cert:readFileSync(join(engineDirectory,'tls','engine.pem')),key:readFileSync(join(engineDirectory,'tls','engine.key'))});assert.equal(cross.status,403);
 result.checks.heartbeat.unknownAndCrossProjectRefused=true;
 mcp=new Client({name:'stage3-acceptance',version:'1'});
 await mcp.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:13800/mcp/v1/p/${project.id}`),{requestInit:{headers:{authorization:`Bearer ${fixture.key}`,'x-opintel-agent-id':'stage3-acceptance'}}}));
 const query=await mcp.callTool({name:'opintel.query',arguments:{sql:'SELECT answer FROM image_source.public.records'}});
 assert.notEqual(query.isError,true);assert.deepEqual(query.structuredContent?.rows,[[42]]);assert.ok(query.structuredContent?.evidenceId);
 result.checks.governedQuery={rows:1,evidenceId:query.structuredContent.evidenceId};
 if(ingest)result.checks.ingest=await ingest.delivered(wait,pendingFiling,sql=>gatewayCompose('postgres','exec','-T','postgres','psql','-U','opintel','-d','opintel','-Atc',sql),sql=>source('exec','-T','source','psql','-U','source','-d','source','-Atc',sql));
 result.status='passed';write(join(directory,'result.json'),result);console.log('Stage3 core package acceptance passed: '+join(directory,'result.json'));
}catch(error){result.status='failed';result.failure=error instanceof Error?error.message:'Acceptance failed';write(join(directory,'result.json'),result);throw error;}
finally{
 if(mcp)await mcp.close();
 for(const project of [gatewayProject,engineProject,sourceProject]){
  const containers=exec('docker',['ps','-aq','--filter',`label=com.docker.compose.project=${project}`]);
  if(containers){const ids=containers.split('\n');write(join(directory,project+'.log'),ids.map(container=>spawnSync('docker',['logs',container],{encoding:'utf8'})).map(log=>log.stdout+log.stderr).join('\n'));exec('docker',['stop',...ids]);exec('docker',['rm',...ids]);}
  const networks=exec('docker',['network','ls','--filter',`label=com.docker.compose.project=${project}`,'--format','{{.ID}}']);
  if(networks)exec('docker',['network','rm',...networks.split('\n')]);
 }
}
