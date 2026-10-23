import process from 'node:process';
import {URL} from 'node:url';
import console from 'node:console';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {X509Certificate} from 'node:crypto';
import {request} from 'node:https';
import {setTimeout} from 'node:timers/promises';
import {setTimeout as deadlineTimer,clearTimeout} from 'node:timers';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import ts from 'typescript';
function exec(command,args,options={}){
 const r=spawnSync(command,args,{encoding:'utf8',...options});
 if(r.error||r.status!==0)throw new Error(`${command} failed (${r.status}): ${r.stderr??''}`);
 return r.stdout;
}
mkdirSync('tmp',{recursive:true});
const directory=resolve(mkdtempSync('tmp/images-smoke-')),tls=resolve(directory,'tls');mkdirSync(tls);
writeFileSync(resolve(directory,'seed-smoke.js'),ts.transpileModule(readFileSync('scripts/images/seed-smoke.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText);
for(const name of ['audit','custody','xq']){mkdirSync(resolve(directory,name));chmodSync(resolve(directory,name),0o777);}
exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tls+'/ca.key','-out',tls+'/ca.pem','-subj','/CN=Image smoke CA','-days','2']);
for(const name of ['server','client','spicedb']){
 exec('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',`${tls}/${name}.key`,'-out',`${tls}/${name}.csr`,'-subj',`/CN=${name}`]);
 writeFileSync(`${tls}/${name}.ext`,'subjectAltName=DNS:localhost,DNS:egress,DNS:spicedb,IP:127.0.0.1\nextendedKeyUsage=serverAuth,clientAuth\n');
 exec('openssl',['x509','-req','-in',`${tls}/${name}.csr`,'-CA',tls+'/ca.pem','-CAkey',tls+'/ca.key','-CAcreateserial','-out',`${tls}/${name}.pem`,'-days','2','-extfile',`${tls}/${name}.ext`]);
 // Synthetic, two-day fixture keys only. Operator keys must use restricted UID ownership.
 chmodSync(`${tls}/${name}.key`,0o644);
}
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
write('application-tls.json',{caFile:'tls/ca.pem',certFile:'tls/client.pem',keyFile:'tls/client.key'});
write('service.json',{host:'0.0.0.0',port:3100,tls:{caFile:'tls/ca.pem',certFile:'tls/server.pem',keyFile:'tls/server.key',clientPinFile:'tls/client.pem'},auditFile:'/audit/sampling.jsonl',postgresExtension:'/work/tmp/duckdb-extensions/postgres_scanner.duckdb_extension',postgresReadinessSource:'secret://image/source',limits:{maxConnectionsPerSource:2,statementTimeoutMs:8000,operationTimeoutMs:9000}});
write('egress.json',{sources:[{address:'172.30.92.10',port:5432}]});
const url='postgresql://opintel:opintel@postgres:5432/opintel_image_smoke';
writeFileSync(resolve(directory,'runtime.env'),`DATABASE_URL=${url}\nMIGRATION_DATABASE_URL=${url}\nREDIS_URL=redis://redis:6379\nSPICEDB_ENDPOINT=spicedb:50051\nSPICEDB_TOKEN=devkey\nOPINTEL_SECRET_IMAGE_SOURCE=postgresql://opintel:opintel@172.30.92.10:5432/opintel_image_smoke\nOPINTEL_IMAGE_SMOKE=synthetic-only\n`,{mode:0o600});
const tag=process.env.TAG??exec('git',['rev-parse','--short=12','HEAD']).trim();
const env={...process.env,TAG:tag,PLATFORM:'linux/amd64',POSTGRES_PORT:'15432',REDIS_PORT:'16379',SPICEDB_PORT:'15051',API_PORT:'13800',CONSOLE_PORT:'13873',ENGINE_PORT:'13810',APPLICATION_CONFIG_DIRECTORY:directory,ENGINE_CONFIG_DIRECTORY:directory,ENGINE_SECRET_ENV_FILE:resolve(directory,'runtime.env'),API_SECRET_ENV_FILE:resolve(directory,'runtime.env'),ENGINE_POLICY_FILE:resolve(directory,'egress.json'),ENGINE_AUDIT_DIRECTORY:resolve(directory,'audit'),ENGINE_CUSTODY_DIRECTORY:resolve(directory,'custody'),XQ_DIRECTORY:resolve(directory,'xq')};
const project='opintel-images-'+Date.now(),base=['compose','-p',project,'-f','deploy/images/compose.yml','-f','deploy/images/smoke.compose.yml'];
const compose=(...args)=>exec('docker',[...base,...args],{env});
async function wait(check){const until=Date.now()+90000;for(;;){try{return await check();}catch(error){if(Date.now()>until)throw error;await setTimeout(500);}}}
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=deadlineTimer(()=>reject(new Error(label+' exceeded 60 seconds')),60000);})]);}finally{clearTimeout(timer);}}
function health(){return new Promise((resolve,reject)=>{const q=request({hostname:'127.0.0.1',port:13810,path:'/health',method:'POST',ca:readFileSync(tls+'/ca.pem'),cert:readFileSync(tls+'/client.pem'),key:readFileSync(tls+'/client.key'),timeout:5000},r=>{let body='';r.on('data',b=>{body+=b;});r.on('end',()=>{try{const value=JSON.parse(body);if(r.statusCode!==200||value.queryEngineVersion!=='v1.5.6/069cc9f9b5')throw new Error('Engine not ready');resolve(value);}catch(error){reject(error);}});});q.on('error',reject);q.on('timeout',()=>q.destroy(new Error('Health timeout')));q.end();});}
let client;
try{
 compose('up','-d','--wait','postgres','redis','spicedb');
 compose('exec','-T','postgres','createdb','-U','opintel','opintel_image_smoke');
 compose('exec','-T','postgres','psql','-U','opintel','-d','opintel_image_smoke','-c','CREATE SCHEMA image_smoke; CREATE TABLE image_smoke.records(answer integer); INSERT INTO image_smoke.records VALUES(42); ANALYZE image_smoke.records;');
 compose('run','--rm','--no-deps','api','node','src/platform/db/migrate.js','up');
 compose('up','-d','egress','engine');
 const readiness=await wait(health);
 compose('run','--rm','--no-deps','--volume',`${resolve(directory,'seed-smoke.js')}:/work/scripts/images/seed-smoke.js:ro`,'api','node','scripts/images/seed-smoke.js');
 compose('up','-d','api','console');
 await wait(async()=>{const r=await globalThis.fetch('http://127.0.0.1:13873/');if(!r.ok)throw new Error('Console not ready');});
 await wait(async()=>{const r=await globalThis.fetch('http://127.0.0.1:13800/api/v1/me');await r.text();if(r.status>=500)throw new Error('API not ready');});
 const credential=JSON.parse(compose('exec','-T','api','cat','/mail/image-smoke.json'));
 client=new Client({name:'image-smoke',version:'1'});
 await bounded(client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:13800/mcp/v1/p/${credential.projectId}`),{requestInit:{headers:{authorization:`Bearer ${credential.key}`,'x-opintel-agent-id':'image-smoke'}}})),'MCP initialization');
 const result=await bounded(client.callTool({name:'opintel.query',arguments:{sql:'SELECT answer FROM image_source.public.records'}}),'Governed query');
 if(result.isError||JSON.stringify(result.structuredContent?.rows)!=='[[42]]'||!result.structuredContent?.evidenceId)throw new Error('Governed query did not return the entitled synthetic row and evidence id');
 const pin=new X509Certificate(readFileSync(tls+'/server.pem')).fingerprint256;
 write('result.json',{status:'passed',platform:'linux/amd64',tag,readiness,evidenceId:result.structuredContent.evidenceId,rows:1,enginePin:pin});
 console.log('Image smoke passed: readiness, console, governed MCP query and evidence id. Record: '+resolve(directory,'result.json'));
}catch(error){writeFileSync(resolve(directory,'services.log'),compose('logs','--no-color'));throw error;}
finally{try{if(client)await bounded(client.close(),'MCP shutdown');}finally{compose('down');}}
