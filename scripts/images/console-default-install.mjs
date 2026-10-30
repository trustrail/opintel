import process from 'node:process';
import console from 'node:console';
// Fresh offline archives acceptance; never alters development containers or env files.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import assert from 'node:assert/strict';
import {firstHourSource} from './first-hour-source.mjs';
const [archivesArg,revision]=process.argv.slice(2),archives=resolve(archivesArg),directory=resolve(mkdtempSync('tmp/console-default-acceptance-'));process.umask(0o077);
let phase='extract',source,mail;const result={status:'running',revision,directory,steps:[]};
function run(command,args,name){const r=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});writeFileSync(join(directory,name+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});if(r.error||r.status!==0)throw new Error(`${phase}: ${name} failed; private log retained`);return r.stdout;}
function record(name){result.steps.push({name,status:'passed'});writeFileSync(join(directory,'install-result.json'),JSON.stringify(result,null,2));}
const roots={gateway:join(directory,'gateway'),engine:join(directory,'engine')},command=(kind,name,...args)=>run(join(roots[kind],name),args,kind+'-'+name);
try{
 for(const kind of ['gateway','engine'])run('tar',['-xpf',join(archives,`${kind}-${revision.slice(0,7)}-amd64.tar.gz`),'-C',directory],'extract-'+kind);record('fresh-archives-extracted');
 const provider=parse(readFileSync('.env','utf8')),names=['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'];for(const name of names)assert.ok(provider[name],'Missing installation setting '+name);
 const email='owner@first-run.invalid',base='https://host.docker.internal',password=randomBytes(24).toString('hex'),settings={APP_BASE_URL:base,OWNER_EMAIL:email,...Object.fromEntries(names.map(n=>[n,provider[n]])),SMTP_HOST:'host.docker.internal',SMTP_PORT:'11465',SMTP_USER:'acceptance',SMTP_PASSWORD:password,SMTP_SENDER:'noreply@first-run.invalid',SMTP_TLS_MODE:'implicit'};
 writeFileSync(join(roots.gateway,'package.env'),Object.entries(settings).map(([k,v])=>k+"='"+v.replaceAll("'","\\'")+"'").join('\n')+'\n',{mode:0o600});
 phase='gateway-install';command('gateway','install');record('gateway-installed-from-archive');phase='engine-install';const output=command('engine','install');record('engine-installed-from-archive');
 phase='pair';const address=/Engine address: (\S+)/u.exec(output)?.[1],code=/Pairing code \(expires in 15 minutes\): (\S+)/u.exec(output)?.[1];assert.ok(address&&code,'Pairing metadata missing');command('gateway','register-engine',address,code);record('one-code-pairing');
 phase='smtp-catcher';const tls=join(directory,'mail');mkdirSync(tls,{mode:0o700});run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(tls,'mail.key'),'-out',join(tls,'mail.csr'),'-subj','/CN=host.docker.internal'],'mail-csr');writeFileSync(join(tls,'mail.ext'),'subjectAltName=DNS:host.docker.internal\nextendedKeyUsage=serverAuth\n');run('openssl',['x509','-req','-in',join(tls,'mail.csr'),'-CA',join(roots.gateway,'state/ca.pem'),'-CAkey',join(roots.gateway,'state/ca.key'),'-CAcreateserial','-out',join(tls,'mail.pem'),'-days','2','-extfile',join(tls,'mail.ext')],'mail-sign');
 const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));mail='opintel-first-run-mail-'+Date.now();run('docker',['run','--detach','--name',mail,'--platform','linux/amd64','--publish','127.0.0.1:11465:1025','--publish','0.0.0.0:11825:8025','--env','MP_SMTP_TLS_CERT=/tls/mail.pem','--env','MP_SMTP_TLS_KEY=/tls/mail.key','--env','MP_SMTP_REQUIRE_TLS=true','--env','MP_SMTP_AUTH_ACCEPT_ANY=false','--env','MP_SMTP_AUTH=acceptance:'+password,'--volume',tls+':/tls:ro',upstream['x-acceptance-images'].mailpit],'mail-start');
 phase='external-source';source=await firstHourSource({directory,image:upstream['x-acceptance-images'].customerPostgres,host:'host.docker.internal',recordFailure:()=>{}});command('engine','sources','add','claims-db','--host',source.host,'--port',source.port,'--database',source.database,'--user',source.user,'--password-file',source.passwordFile);record('engine-sources-add');
 writeFileSync(join(directory,'browser.json'),JSON.stringify({base,email,mail:'http://host.docker.internal:11825'}),{mode:0o600});phase='packaged-console';const version=JSON.parse(readFileSync('package-lock.json','utf8')).packages['node_modules/@playwright/test'].version;
 run('docker',['run','--rm','--init','--ipc=host','--platform','linux/amd64','--volume',resolve('node_modules')+':/work/node_modules:ro','--volume',resolve('scripts/images/console-default-browser.mjs')+':/work/browser.mjs:ro','--volume',directory+':/acceptance','--workdir','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs'],'browser');result.browser=JSON.parse(readFileSync(join(directory,'browser-result.json'),'utf8'));assert.equal(result.browser.status,'passed','Browser first-run acceptance failed');result.status='passed';
}catch(error){result.status='failed';result.failure={phase,message:error instanceof Error?error.message:'Unknown failure'};process.exitCode=1;}finally{
 try{source?.close();}catch{/* Preserve the original acceptance failure. */}
 if(mail)spawnSync('docker',['rm','--force',mail],{stdio:'ignore'});
 for(const kind of ['engine','gateway']){try{command(kind,'stop');}catch{/* Record remains available for manual cleanup. */}}
 writeFileSync(join(directory,'install-result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({status:result.status,phase,result:join(directory,'install-result.json')}));
}
