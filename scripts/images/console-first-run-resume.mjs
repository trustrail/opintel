// Resume the existing browser stage after the install harness cleaned up its
// ephemeral source and SMTP fixtures. No installation or image build is repeated.
import {URL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {parse} from 'dotenv';
import {firstHourSource} from './first-hour-source.mjs';
const directory=resolve(process.argv[2]),gateway=join(directory,'gateway'),engine=join(directory,'engine');process.umask(0o077);
const previous=JSON.parse(readFileSync(join(directory,'browser-result.json'),'utf8'));
if(previous.failure?.phase!=='decide-column'||!previous.projectId||!previous.poolId)throw new Error('Resume requires the retained decide-column failure and existing project/pool.');
const config=JSON.parse(readFileSync(join(directory,'browser.json'),'utf8')),upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
let source,mail;const result={status:'running',steps:[]};
function run(command,args,name){const r=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});writeFileSync(join(directory,'resume-'+name+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});if(r.error||r.status!==0)throw new Error(name+' failed; private log retained');}
try{
 copyFileSync(join(directory,'browser-result.json'),join(directory,'browser-result-original.json'));copyFileSync(join(directory,'screenshots/failure.png'),join(directory,'screenshots/decide-column-original.png'));
 const reference=new URL(readFileSync(join(engine,'state/sources/claims-db'),'utf8').trim());
 source=await firstHourSource({directory,image:upstream['x-acceptance-images'].customerPostgres,host:reference.hostname,restorePort:Number(reference.port),recordFailure:()=>{}});
 const settings=parse(readFileSync(join(gateway,'package.env'),'utf8')),mailEnv=join(directory,'resume-mail.env');
 writeFileSync(mailEnv,'MP_SMTP_TLS_CERT=/tls/mail.pem\nMP_SMTP_TLS_KEY=/tls/mail.key\nMP_SMTP_REQUIRE_TLS=true\nMP_SMTP_AUTH_ACCEPT_ANY=false\nMP_SMTP_AUTH=acceptance:'+settings.SMTP_PASSWORD+'\n',{mode:0o600});
 mail='opintel-first-run-resume-mail-'+Date.now();run('docker',['run','--detach','--name',mail,'--platform','linux/amd64','--publish','127.0.0.1:11465:1025','--publish','0.0.0.0:11825:8025','--env-file',mailEnv,'--volume',join(directory,'mail')+':/tls:ro',upstream['x-acceptance-images'].mailpit],'mail-start');
 run(join(gateway,'start'),[],'gateway-start');run(join(engine,'start'),[],'engine-start');
 writeFileSync(join(directory,'browser.json'),JSON.stringify({...config,resume:{projectId:previous.projectId,poolId:previous.poolId}}),{mode:0o600});
 const version=JSON.parse(readFileSync('package-lock.json','utf8')).packages['node_modules/@playwright/test'].version;
 run('docker',['run','--rm','--init','--ipc=host','--platform','linux/amd64','--volume',resolve('node_modules')+':/work/node_modules:ro','--volume',resolve('scripts/images/console-first-run-browser.mjs')+':/work/browser.mjs:ro','--volume',directory+':/acceptance','--workdir','/work',`mcr.microsoft.com/playwright:v${version}-noble`,'node','browser.mjs'],'browser');
 result.status='passed';
}catch(error){result.status='failed';result.error=error instanceof Error?error.message:'Unknown resume error';process.exitCode=1;}finally{
 try{source?.close();}catch{result.sourceCleanupFailed=true;}
 if(mail)spawnSync('docker',['rm','--force',mail],{stdio:'ignore'});
 for(const root of [engine,gateway])try{run(join(root,'stop'),[],'stop-'+(root===engine?'engine':'gateway'));}catch{result.stopFailed=true;}
 writeFileSync(join(directory,'resume-result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({status:result.status,result:join(directory,'resume-result.json')}));
}
