import {createAcceptanceLab} from './acceptance-lab.mjs';
import process from 'node:process';
const {fetch}=globalThis;
import console from 'node:console';
// Fresh offline archives acceptance; never alters development containers or env files.
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import assert from 'node:assert/strict';
import {setInterval,clearInterval} from 'node:timers';
import {setTimeout as delay} from 'node:timers/promises';
import {firstHourSource} from './first-hour-source.mjs';
const [archivesArg,revision]=process.argv.slice(2),archives=resolve(archivesArg),directory=resolve(mkdtempSync('tmp/console-final-workflows-acceptance-'));process.umask(0o077);
const lab=createAcceptanceLab({directory});
let phase='extract',source,mail;const result={status:'running',revision,directory,steps:[]};
function run(command,args,name){const r=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});writeFileSync(join(directory,name+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});if(r.error||r.status!==0)throw new Error(`${phase}: ${name} failed; private log retained`);return r.stdout;}
function record(name){result.steps.push({name,status:'passed'});writeFileSync(join(directory,'install-result.json'),JSON.stringify(result,null,2));}
const roots={gateway:join(directory,'gateway'),engine:join(directory,'engine')},command=(kind,name,...args)=>run(join(roots[kind],name),args,kind+'-'+name);
for(const root of Object.values(roots))lab.trackCompose(root);
try{
 run('tar',['-xpf',join(archives,`gateway-${revision.slice(0,7)}-amd64.tar.gz`),'-C',directory],'extract-gateway');
 const provider=parse(readFileSync('.env','utf8')),names=['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'];for(const name of names)assert.ok(provider[name],'Missing installation setting '+name);
 const email='owner@first-run.invalid',base='https://host.docker.internal',password=randomBytes(24).toString('hex'),settings={APP_BASE_URL:base,OWNER_EMAIL:email,...Object.fromEntries(names.map(n=>[n,provider[n]])),SMTP_HOST:'host.docker.internal',SMTP_PORT:'11465',SMTP_USER:'acceptance',SMTP_PASSWORD:password,SMTP_SENDER:'noreply@first-run.invalid',SMTP_TLS_MODE:'implicit'};
 writeFileSync(join(roots.gateway,'package.env'),Object.entries(settings).map(([k,v])=>k+"='"+v.replaceAll("'","\\'")+"'").join('\n')+'\n',{mode:0o600});
 phase='gateway-install';command('gateway','install');unlinkSync(join(roots.gateway,'images.tar'));record('gateway-installed-from-archive');
 run('tar',['-xpf',join(archives,`engine-${revision.slice(0,7)}-amd64.tar.gz`),'-C',directory],'extract-engine');record('fresh-archives-extracted');
 phase='engine-install';const output=command('engine','install');unlinkSync(join(roots.engine,'images.tar'));record('engine-installed-from-archive');
 phase='pair';const address=/Engine address: (\S+)/u.exec(output)?.[1],code=/Pairing code \(expires in 15 minutes\): (\S+)/u.exec(output)?.[1];assert.ok(address&&code,'Pairing metadata missing');command('gateway','register-engine',address,code);record('one-code-pairing');
 phase='smtp-catcher';const tls=join(directory,'mail');mkdirSync(tls,{mode:0o700});run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(tls,'mail.key'),'-out',join(tls,'mail.csr'),'-subj','/CN=host.docker.internal'],'mail-csr');writeFileSync(join(tls,'mail.ext'),'subjectAltName=DNS:host.docker.internal\nextendedKeyUsage=serverAuth\n');run('openssl',['x509','-req','-in',join(tls,'mail.csr'),'-CA',join(roots.gateway,'state/ca.pem'),'-CAkey',join(roots.gateway,'state/ca.key'),'-CAcreateserial','-out',join(tls,'mail.pem'),'-days','2','-extfile',join(tls,'mail.ext')],'mail-sign');
 const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));mail='opintel-first-run-mail-'+Date.now();run('docker',['run',...lab.labelArgs,'--detach','--name',mail,'--platform','linux/amd64','--publish','127.0.0.1:11465:1025','--publish','127.0.0.1:11825:8025','--env','MP_SMTP_TLS_CERT=/tls/mail.pem','--env','MP_SMTP_TLS_KEY=/tls/mail.key','--env','MP_SMTP_REQUIRE_TLS=true','--env','MP_SMTP_AUTH_ACCEPT_ANY=false','--env','MP_SMTP_AUTH=acceptance:'+password,'--volume',tls+':/tls:ro',upstream['x-acceptance-images'].mailpit],'mail-start');
 phase='external-source';source=await firstHourSource({directory,image:upstream['x-acceptance-images'].customerPostgres,host:'host.docker.internal',recordFailure:()=>{},lab});command('engine','sources','add','claims-db','--host',source.host,'--port',source.port,'--database',source.database,'--user',source.user,'--password-file',source.passwordFile);command('engine','sources','add','landings-db','--host',source.host,'--port',source.port,'--database',source.database,'--user',source.user,'--password-file',source.passwordFile);record('engine-sources-add');
 const rendererArgs=[...readFileSync('playwright.config.ts','utf8').matchAll(/^\s*'(--[^']+)'/gmu)].map(m=>m[1]);assert.ok(rendererArgs.includes('--force-color-profile=srgb'),'Central renderer policy missing');writeFileSync(join(directory,'browser.json'),JSON.stringify({base,email,mail:'http://host.docker.internal:11825',rendererArgs}),{mode:0o600});phase='packaged-console';const version=JSON.parse(readFileSync('package-lock.json','utf8')).packages['node_modules/@playwright/test'].version;
 const fixture=async(input)=>{
  if(input.kind==='mail-next'){
   for(let n=0;n<120;n++){const list=await(await fetch('http://127.0.0.1:11825/api/v1/messages')).json();const m=list.messages.find(m=>!input.previous.includes(m.ID)&&m.To.some(to=>to.Address===email));if(m){const message=await(await fetch('http://127.0.0.1:11825/api/v1/message/'+m.ID)).json();const link=message.Text.match(/https:\/\/[^\s<>]+/u)?.[0];assert.ok(link);return {id:m.ID,link};}await delay(500);}throw new Error('Owner SMTP message missing');
  }
  throw new Error('Unknown acceptance fixture action');
 };
 const fd=openSync(join(directory,'browser.log'),'w',0o600),child=spawn('docker',['run',...lab.labelArgs,'--rm','--init','--ipc=host','--platform','linux/amd64','--volume',resolve('node_modules')+':/work/node_modules:ro','--volume',resolve('scripts/images/console-final-workflows-browser.mjs')+':/work/browser.mjs:ro','--volume',directory+':/acceptance','--workdir','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs'],{stdio:['ignore',fd,fd]});let busy=false,activeFixture;
 const timer=setInterval(()=>{if(busy||!existsSync(join(directory,'fixture-request.json')))return;busy=true;const input=JSON.parse(readFileSync(join(directory,'fixture-request.json'),'utf8'));unlinkSync(join(directory,'fixture-request.json'));activeFixture=fixture(input).then(value=>writeFileSync(join(directory,'fixture-result.json'),JSON.stringify({ok:true,value}))).catch(()=>writeFileSync(join(directory,'fixture-result.json'),JSON.stringify({ok:false}))).finally(()=>{busy=false;});},250);
 try{const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(status,0,'Packaged browser verification failed; private log retained');}finally{clearInterval(timer);await activeFixture;closeSync(fd);};result.browser=JSON.parse(readFileSync(join(directory,'browser-result.json'),'utf8'));assert.equal(result.browser.status,'passed','Browser first-run acceptance failed');result.status='passed';
}catch(error){result.status='failed';result.failure={phase,message:error instanceof Error?error.message:'Unknown failure'};process.exitCode=1;}finally{
 try{source?.close();}catch{/* Preserve the original acceptance failure. */}
 result.labCleanup=lab.cleanup();if(result.labCleanup.status!=='passed'){result.status='failed';process.exitCode=1;}
 writeFileSync(join(directory,'install-result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({status:result.status,phase,result:join(directory,'install-result.json')}));
}
