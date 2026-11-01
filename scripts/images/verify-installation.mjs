import {URL} from 'node:url';
const {fetch,AbortSignal}=globalThis;
import {startRunCapture} from '../run-capture.mjs';
import process from 'node:process';
import console from 'node:console';
// Fresh offline archives acceptance; never alters development containers or env files.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,copyFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {request} from 'node:https';
import {homedir} from 'node:os';
import {setTimeout as pause} from 'node:timers/promises';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import assert from 'node:assert/strict';
import {firstHourSource} from './first-hour-source.mjs';
const [archivesArg,revision,artifactArg]=process.argv.slice(2),archives=resolve(archivesArg),directory=resolve(mkdtempSync('tmp/verify01-packaged-'));process.umask(0o077);
let phase='extract',source,mail,capture;const result={status:'running',revision,directory,steps:[]};
function run(command,args,name){const r=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});writeFileSync(join(directory,name+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});if(r.error||r.status!==0)throw new Error(`${phase}: ${name} failed; private log retained`);return r.stdout;}
function record(name){result.steps.push({name,status:'passed'});writeFileSync(join(directory,'install-result.json'),JSON.stringify(result,null,2));}
const roots={gateway:join(directory,'gateway'),engine:join(directory,'engine')},command=(kind,name,...args)=>run(join(roots[kind],name),args,kind+'-'+name);
try{
 capture=await startRunCapture(join(directory,'observations'));
 for(const kind of ['gateway','engine'])run('tar',['-xpf',join(archives,`${kind}-${revision.slice(0,7)}-amd64.tar.gz`),'-C',directory],'extract-'+kind);record('fresh-archives-extracted');
 const provider=parse(readFileSync('.env','utf8')),names=['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'];for(const name of names)assert.ok(provider[name],'Missing installation setting '+name);
 const email='owner@first-run.invalid',base='https://host.docker.internal',password=randomBytes(24).toString('hex'),settings={APP_BASE_URL:base,OWNER_EMAIL:email,...Object.fromEntries(names.map(n=>[n,provider[n]])),SMTP_HOST:'host.docker.internal',SMTP_PORT:'11465',SMTP_USER:'acceptance',SMTP_PASSWORD:password,SMTP_SENDER:'noreply@first-run.invalid',SMTP_TLS_MODE:'implicit'};
 writeFileSync(join(roots.gateway,'package.env'),Object.entries(settings).map(([k,v])=>k+"='"+v.replaceAll("'","\\'")+"'").join('\n')+'\n',{mode:0o600});
 phase='gateway-install';command('gateway','install');record('gateway-installed-from-archive');phase='engine-install';const output=command('engine','install');record('engine-installed-from-archive');
 phase='pair';const address=/Engine address: (\S+)/u.exec(output)?.[1],code=/Pairing code \(expires in 15 minutes\): (\S+)/u.exec(output)?.[1];assert.ok(address&&code,'Pairing metadata missing');command('gateway','register-engine',address,code);record('one-code-pairing');
 phase='smtp-catcher';const tls=join(directory,'mail');mkdirSync(tls,{mode:0o700});run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(tls,'mail.key'),'-out',join(tls,'mail.csr'),'-subj','/CN=host.docker.internal'],'mail-csr');writeFileSync(join(tls,'mail.ext'),'subjectAltName=DNS:host.docker.internal\nextendedKeyUsage=serverAuth\n');run('openssl',['x509','-req','-in',join(tls,'mail.csr'),'-CA',join(roots.gateway,'state/ca.pem'),'-CAkey',join(roots.gateway,'state/ca.key'),'-CAcreateserial','-out',join(tls,'mail.pem'),'-days','2','-extfile',join(tls,'mail.ext')],'mail-sign');
 const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));mail='opintel-first-run-mail-'+Date.now();run('docker',['run','--detach','--name',mail,'--platform','linux/amd64','--publish','127.0.0.1:11465:1025','--publish','0.0.0.0:11825:8025','--env','MP_SMTP_TLS_CERT=/tls/mail.pem','--env','MP_SMTP_TLS_KEY=/tls/mail.key','--env','MP_SMTP_REQUIRE_TLS=true','--env','MP_SMTP_AUTH_ACCEPT_ANY=false','--env','MP_SMTP_AUTH=acceptance:'+password,'--volume',tls+':/tls:ro',upstream['x-acceptance-images'].mailpit],'mail-start');
 phase='identity-import';const mapping=JSON.parse(readFileSync('scripts/soak/certificates.example.json','utf8'));for(const m of mapping){const folder=join(homedir(),'.xq/v02',String(m.certificateId)),archive=readdirSync(folder).find(n=>n.endsWith('-'+m.certificateId+'.zip'));assert.ok(archive);const copy=join(directory,archive);copyFileSync(join(folder,archive),copy);chmodSync(copy,0o600);command('gateway','identities','add',copy,'--device',m.deviceName);}record('customer-identities-add');
 phase='external-source';source=await firstHourSource({directory,image:upstream['x-acceptance-images'].customerPostgres,host:'host.docker.internal',recordFailure:()=>{}});
 phase='normal-owner-login';const ca=readFileSync(join(roots.gateway,'state/ca.pem'));
 const https=(path,body)=>new Promise((ok,fail)=>{const q=request('https://127.0.0.1'+path,{method:'POST',ca,headers:{origin:'https://127.0.0.1','content-type':'application/json'},signal:AbortSignal.timeout(30000)},r=>{let text='';r.on('data',c=>text+=c);r.on('end',()=>ok({status:r.statusCode,headers:r.headers}));});q.on('error',fail);q.end(JSON.stringify(body));});
 let ready=false;for(let n=0;n<120;n++){try{ready=(await fetch('http://127.0.0.1:11825/api/v1/messages')).ok;if(ready)break;}catch{/* The local SMTP fixture may still be starting. */}await pause(500);}assert.ok(ready);
 const before=(await(await fetch('http://127.0.0.1:11825/api/v1/messages')).json()).messages.map(m=>m.ID),deviceNonce='verify01-fresh-'+Date.now();assert.equal((await https('/api/v1/auth/request-link',{email,deviceNonce})).status,202);
 let token;for(let n=0;n<120;n++){const list=await(await fetch('http://127.0.0.1:11825/api/v1/messages')).json(),m=list.messages.find(m=>!before.includes(m.ID)&&m.To.some(t=>t.Address===email));if(m){const full=await(await fetch('http://127.0.0.1:11825/api/v1/message/'+m.ID)).json();token=new URL(full.Text.match(/https:\/\/[^\s<>]+/u)[0]).searchParams.get('token');break;}await pause(500);}assert.ok(token);const signed=await https('/api/v1/auth/callback',{token,deviceNonce});assert.equal(signed.status,200);
 const cookieFile=join(directory,'owner.cookie');writeFileSync(cookieFile,signed.headers['set-cookie'].find(c=>c.startsWith('opintel_session=')).split(';')[0],{mode:0o600});record('normal-owner-SMTP-login');
 const uri=new URL('postgresql://127.0.0.1:'+source.port+'/'+source.database);uri.username=source.user;uri.password=readFileSync(source.passwordFile,'utf8');const targetFile=join(directory,'source-uri'),keyFile=join(directory,'xq-key'),certificates=join(directory,'certificates.json');writeFileSync(targetFile,uri.href,{mode:0o600});writeFileSync(keyFile,provider.OPINTEL_XQ_API_KEY,{mode:0o600});writeFileSync(certificates,JSON.stringify(mapping),{mode:0o600});
 const configFile=join(directory,'verifier.json'),config={base:'https://127.0.0.1',gatewayDirectory:roots.gateway,engineDirectory:roots.engine,cookieFile,targetFile,certificates,xqApiKeyFile:keyFile,custody:{tenant:provider.OPINTEL_XQ_TEAM_ID,region:'us-east-1'},sourceHost:'host.docker.internal',engineAddress:'https://host.docker.internal:3100'};writeFileSync(configFile,JSON.stringify(config),{mode:0o600});
 const program=join(resolve(artifactArg),'verify'),env={...process.env,NODE_EXTRA_CA_CERTS:join(roots.gateway,'state/ca.pem')};
 const verify=(output,args)=>{const r=spawnSync(program,['--config',configFile,'--output',join(directory,output),...args],{env,encoding:'utf8',timeout:1800000,maxBuffer:1024*1024});writeFileSync(join(directory,output+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});return {exit:r.status,report:JSON.parse(readFileSync(join(directory,output,'result.json'),'utf8'))};};
 phase='verifier-all';const all=verify('all',['--all','--random-seconds','120']);result.all={exit:all.exit,counts:all.report.counts,report:join(directory,'all/result.json')};assert.equal(all.exit,0);assert.equal(all.report.status,'passed');assert.equal(all.report.counts.passed,115);assert.equal(all.report.counts.notExercised,0);record('all-115-cells-and-two-minute-traffic');
 phase='missing-prerequisite';writeFileSync(configFile,JSON.stringify({...config,cookieFile:join(directory,'deliberately-absent-session')}),{mode:0o600});const missing=verify('missing',['--all']);result.missing={exit:missing.exit,counts:missing.report.counts};assert.equal(missing.exit,1);assert.equal(missing.report.counts.notExercised,115);record('missing-prerequisite-fails-not-exercised');writeFileSync(configFile,JSON.stringify(config),{mode:0o600});
 phase='custody-only';mkdirSync(join(directory,'custody'),{mode:0o700});for(const file of ['setup.json','v01.json','source-registration.json'])copyFileSync(join(directory,'all',file),join(directory,'custody',file));const custody=verify('custody',['--capability','custody']);result.custody={exit:custody.exit,counts:custody.report.counts,report:join(directory,'custody/result.json')};assert.equal(custody.exit,0);assert.equal(custody.report.counts.passed,16);assert.ok(custody.report.cells.every(c=>c.capability==='custody'));record('custody-only-16-cells');result.status='passed';
}catch(error){result.status='failed';result.failure={phase,message:error instanceof Error?error.message:'Unknown failure'};process.exitCode=1;}finally{
 try{source?.close();}catch{/* Preserve the original acceptance failure. */}
 if(mail)spawnSync('docker',['rm','--force',mail],{stdio:'ignore'});
 for(const kind of ['engine','gateway']){try{command(kind,'stop');}catch{/* Record remains available for manual cleanup. */}}
 await capture?.stop();
 writeFileSync(join(directory,'install-result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({status:result.status,phase,result:join(directory,'install-result.json')}));
}
