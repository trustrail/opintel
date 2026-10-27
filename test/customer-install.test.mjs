import {createServer} from 'node:https';
import {X509Certificate} from 'node:crypto';
import {HttpsEngineProbe,loadApplicationTls} from '../src/modules/engines/index.js';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,statSync,copyFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
import {checkBinding} from '../src/modules/release-custody/infrastructure/availability.js';
import {afterEach,it,expect} from 'vitest';
import {packageDeployment} from '../scripts/images/package.mjs';
import {auditPackage,auditCustomerEnvironment} from '../scripts/images/package-audit.mjs';
const clean=[];
afterEach(()=>{for(const path of clean.splice(0))rmSync(path,{force:true,recursive:true});});
function packageRoot(kind){
 const root=mkdtempSync(join(tmpdir(),'customer-install-'));clean.push(root);
 const upstream=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
 const manifest={revision:'a'.repeat(40),upstream,artifacts:['api','console','engine','egress','migrations','provisioning','demo-tools'].map(target=>({target,platform:'linux/amd64',repoDigests:[`ghcr.io/trustrail/opintel-${target}@sha256:${'b'.repeat(64)}`]}))};
 packageDeployment(manifest,join(root,'packages'),'linux/amd64');const directory=join(root,'packages',kind);
 writeFileSync(join(directory,'platform'),'linux/amd64');writeFileSync(join(directory,'upstream.json'),JSON.stringify({services:upstream.services}));
 writeFileSync(join(directory,'local-images.json'),JSON.stringify(Object.fromEntries([...manifest.artifacts.map(a=>a.repoDigests[0]),...Object.values(upstream.services).map(s=>s.image)].map((image,i)=>[image,'opintel-package/test:'+i]))));
 writeFileSync(join(directory,'package.env'),['APP_BASE_URL=https://192.0.2.10','OWNER_EMAIL=owner@example.invalid','OPINTEL_XQ_API_KEY=synthetic','OPINTEL_XQ_DASHBOARD_API_KEY=synthetic','OPINTEL_XQ_SENDER_ALIAS=synthetic','OPINTEL_XQ_SENDER_ACCESS_TOKEN=synthetic','OPINTEL_XQ_TEAM_ID=synthetic','SMTP_HOST=smtp.example.invalid','SMTP_PORT=465','SMTP_USER=synthetic','SMTP_PASSWORD=synthetic','SMTP_SENDER=sender@example.invalid','SMTP_TLS_MODE=implicit'].join('\n'),{mode:0o600});
 const run=(...args)=>execFileSync('/bin/sh',['-c','umask 077; exec "$@"','sh',process.execPath,'--import','tsx','scripts/operator/customer-install.ts',...args,kind],{encoding:'utf8',env:{...process.env,PACKAGE_HOST_DIRECTORY:directory,PACKAGE_HOST_ADDRESS:'192.0.2.10',OPINTEL_INSTALL_ROOT:directory},stdio:'pipe'});
 return {directory,run};
}
it.each(['gateway','engine'])('DEP-018: %s initializes private resumable state and one warning-free project',kind=>{
 const {directory,run}=packageRoot(kind);run('initialize');const before=readFileSync(join(directory,'state/runtime.env'),'utf8');run('initialize');expect(readFileSync(join(directory,'state/runtime.env'),'utf8')).toBe(before);
 expect(statSync(join(directory,'state')).mode&0o077).toBe(0);expect(statSync(join(directory,'state/runtime.env')).mode&0o077).toBe(0);expect(statSync(join(directory,'state',kind==='gateway'?'application-tls.json':'service.json')).mode&0o777).toBe(0o600);expect(statSync(join(directory,'state/xq')).mode&0o777).toBe(0o700);
 const result=spawnSync('docker',['compose','--profile','jobs','--project-name',readFileSync(join(directory,'state/project-name'),'utf8').trim(),'--env-file',join(directory,'state/package.env'),'-f',join(directory,'state/compose.json'),'config','--format','json'],{encoding:'utf8',stdio:'pipe',env:{...process.env,COMPOSE_PROJECT_NAME:'foreign-project'}});
 expect(result.status).toBe(0);expect(result.stderr).toBe('');
 const config=JSON.parse(result.stdout);expect(config.name).toMatch(new RegExp('^opintel-'+kind+'-'));for(const service of Object.values(config.services)){expect(service.pull_policy).toBe('never');expect(service.stdin_open).not.toBe(true);}
 if(kind==='gateway'){expect(config.services['demo-tools'].environment.APPLICATION_TLS_CONFIG).toBe('/config/application-tls.json');expect(JSON.parse(readFileSync(join(directory,'state/application-tls.json'),'utf8'))).toEqual({caFile:'/config/peer-ca.pem',certFile:'/config/application.pem',keyFile:'/config/application.key'});expect(config.services.console.ports).toBeUndefined();expect(config.services.ingress.ports[0].published).toBe('443');expect(before).toContain('PAL_PROVIDER=\'disabled\'');expect(before).not.toContain('MIGRATION_DATABASE_URL');expect(readFileSync(join(directory,'state/operator.env'),'utf8')).toContain("OPINTEL_OPERATOR_API_TARGET='https://ingress:8444'");expect(readFileSync(join(directory,'state/operator.env'),'utf8')).toContain("OPINTEL_API_BASE_URL='https://192.0.2.10'");expect(config.services.ingress.ports).toHaveLength(1);const binding=values=>checkBinding({provider:'xq',tenant:'synthetic',region:'us-east-1'},{apiKey:values.OPINTEL_XQ_API_KEY,dashboardApiKey:values.OPINTEL_XQ_DASHBOARD_API_KEY,dashboardAccessToken:'',senderAlias:values.OPINTEL_XQ_SENDER_ALIAS,senderAccessToken:values.OPINTEL_XQ_SENDER_ACCESS_TOKEN,master:values.OPINTEL_CUSTODY_MASTER_KEY,redeemAt:values.OPINTEL_XQ_REDEEM_URL,applicationUrl:values.OPINTEL_API_BASE_URL});expect(binding(parse(before))).toBe(binding(parse(readFileSync(join(directory,'state/operator.env')))));}
 else expect(config.services.engine.network_mode).toBe('service:egress');
},30000);
it('DEP-018: wrong pairing pin refuses before changing trust',()=>{
 const {directory,run}=packageRoot('gateway');run('initialize');const ca=readFileSync(join(directory,'state/ca.pem'),'utf8');
 const identity=JSON.parse(readFileSync(join(directory,'trust.json'),'utf8'));identity.kind='engine';identity.demoSourceUrl='postgresql://synthetic:synthetic@192.0.2.10:5434/readiness';writeFileSync(join(directory,'state/incoming.json'),JSON.stringify(identity));
 expect(()=>execFileSync(process.execPath,['--import','tsx','scripts/operator/customer-install.ts','pair','gateway','wrong-pin'],{env:{...process.env,PACKAGE_HOST_DIRECTORY:directory,OPINTEL_INSTALL_ROOT:directory},stdio:'pipe'})).toThrow();
 expect(readFileSync(join(directory,'state/ca.pem'),'utf8')).toBe(ca);
},30000);
it('DEP-019: customer package audit rejects test-rig variables',()=>{
 const root=mkdtempSync(join(tmpdir(),'package-audit-'));clean.push(root);copyFileSync('deploy/customer/package.env.example',join(root,'package.env'));expect(()=>auditPackage(root)).not.toThrow();
 for(const key of ['OPINTEL_SECRET_DEMO_POSTGRES','OPINTEL_XQ_TEST_PROJECT_ID','OPINTEL_XQ_TEST_POOL_KEY','OPINTEL_STAGE4_SMOKE']){writeFileSync(join(root,'bad.env'),key+'=synthetic');expect(()=>auditPackage(root)).toThrow('test-rig');}
});

it('DEP-018: same-host and split-host pairing retain the registered LAN endpoints',()=>{
 for(const local of [true,false]){
  const {directory,run}=packageRoot('gateway');run('initialize');
  const identity=JSON.parse(readFileSync(join(directory,'trust.json'),'utf8'));identity.kind='engine';identity.address='https://'+(local?'192.0.2.10':'192.0.2.11')+':3100';identity.demoSourceUrl='postgresql://synthetic:synthetic@'+(local?'192.0.2.10':'192.0.2.11')+':5434/readiness';
  writeFileSync(join(directory,'state/incoming.json'),JSON.stringify(identity));
  execFileSync(process.execPath,['--import','tsx','scripts/operator/customer-install.ts','pair','gateway',identity.pin],{env:{...process.env,PACKAGE_HOST_DIRECTORY:directory,OPINTEL_INSTALL_ROOT:directory},stdio:'pipe'});
  expect(JSON.parse(readFileSync(join(directory,'state/output/peer.json'),'utf8')).address).toBe(identity.address);
  expect(readFileSync(join(directory,'state/package.env'),'utf8')).toContain('https://192.0.2.10:3102');
  expect(parse(readFileSync(join(directory,'state/operator.env'))).OPINTEL_DEMO_DATABASE_URL).toBe(identity.demoSourceUrl);
  expect(JSON.parse(readFileSync(join(directory,'state/peer.json'),'utf8')).address).toBe(identity.address);
 }
},60000);

it('DEP-018: independent package CAs pair for the actual pinned health probe and wrong pins still refuse',async()=>{
 const gateway=packageRoot('gateway'),engine=packageRoot('engine');gateway.run('initialize');engine.run('initialize');
 const read=(p,name)=>readFileSync(join(p.directory,'state',name),'utf8');
 expect(new X509Certificate(read(gateway,'ca.pem')).subject).not.toBe(new X509Certificate(read(engine,'ca.pem')).subject);
 for(const [local,peer,kind] of [[gateway,engine,'gateway'],[engine,gateway,'engine']]){
  const identity=JSON.parse(readFileSync(join(peer.directory,kind==='gateway'?'state/gateway-registration.json':'trust.json'),'utf8'));writeFileSync(join(local.directory,'state/incoming.json'),JSON.stringify(identity),{mode:0o600});
  execFileSync(process.execPath,['--import','tsx','scripts/operator/customer-install.ts','pair',kind,identity.pin],{env:{...process.env,PACKAGE_HOST_DIRECTORY:local.directory,OPINTEL_INSTALL_ROOT:local.directory},stdio:'pipe'});
 }
 const config=JSON.parse(read(gateway,'application-tls.json'));for(const name of Object.keys(config))config[name]=join(gateway.directory,'state',config[name].split('/').at(-1));
 const file=join(gateway.directory,'state/test-tls.json');writeFileSync(file,JSON.stringify(config),{mode:0o600});const tls=await loadApplicationTls(file);expect(tls.ca).toBe(JSON.parse(readFileSync(join(engine.directory,'trust.json'),'utf8')).ca);expect(tls.ca).not.toBe(read(engine,'engine.pem'));
 let arrivals=0;const server=createServer({ca:read(engine,'peer-ca.pem'),cert:read(engine,'engine.pem'),key:read(engine,'engine.key'),requestCert:true,rejectUnauthorized:true},(req,res)=>{arrivals++;res.end(JSON.stringify({version:'1.0.0',contract:3,queryEngineVersion:'synthetic',canonicalisers:[]}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const endpoint={baseUrl:'https://127.0.0.1:'+server.address().port,tls:{...tls,certificatePin:new X509Certificate(read(engine,'engine.pem')).fingerprint256.replaceAll(':','')}};
  expect((await new HttpsEngineProbe().health(endpoint)).ok).toBe(true);
  const wrong=await new HttpsEngineProbe().health({...endpoint,tls:{...tls,certificatePin:'00'.repeat(32)}});expect(wrong.ok).toBe(false);expect(wrong.error.details.transportReason).toBe('ENGINE_PIN_MISMATCH');expect(arrivals).toBe(1);
  const wrongCa=await new HttpsEngineProbe().health({...endpoint,tls:{...endpoint.tls,ca:JSON.parse(readFileSync(join(gateway.directory,'trust.json'),'utf8')).ca}});expect(wrongCa.ok).toBe(false);expect(wrongCa.error.details.transportReason).not.toBe('tls_error');expect(arrivals).toBe(1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
},30000);
it('DEP-018: install permission audit rejects a world-readable private key',()=>{
 const {directory,run}=packageRoot('gateway');run('initialize');run('audit-permissions');chmodSync(join(directory,'state/application.key'),0o644);
 expect(()=>run('audit-permissions')).toThrow();
},30000);

it('DEP-019: final archived environment rejects test inputs and operator redeem URL',()=>{
 expect(()=>auditCustomerEnvironment(readFileSync('deploy/customer/package.env.example','utf8'))).not.toThrow();
 for(const name of ['OPINTEL_XQ_TEST_PROJECT_ID','OPINTEL_XQ_TEST_POOL_KEY','OPINTEL_XQ_REDEEM_URL'])expect(()=>auditCustomerEnvironment(name+'=synthetic')).toThrow();
});
it('DEP-018: invalid SMTP reports the validation cause and a private log path',()=>{
 const {directory,run}=packageRoot('gateway');const file=join(directory,'package.env');writeFileSync(file,readFileSync(file,'utf8').replace('SMTP_TLS_MODE=implicit','SMTP_TLS_MODE=invalid'));
 try{run('initialize');throw new Error('Expected SMTP refusal');}catch(error){expect(String(error.stderr)).toContain('Invalid SMTP configuration');expect(String(error.stderr)).toContain('Log: '+directory+'/diagnostics/');}
},30000);
it.each(['gateway','engine'])('DEP-018: %s upgrade tightens modes without rotating credentials',kind=>{
 const {directory,run}=packageRoot(kind);run('initialize');const key=join(directory,'state',kind==='gateway'?'application.key':'engine.key'),before=readFileSync(key),env=readFileSync(join(directory,'state/runtime.env'));
 chmodSync(key,0o644);chmodSync(join(directory,'state/control'),0o777);run('upgrade');
 expect(readFileSync(key)).toEqual(before);expect(readFileSync(join(directory,'state/runtime.env'))).toEqual(env);expect(statSync(key).mode&0o777).toBe(0o600);expect(statSync(join(directory,'state/control')).mode&0o777).toBe(0o700);run('audit-permissions');
},30000);

it('DEP-018: missing TLS material names the field and filesystem cause',async()=>{
 const root=mkdtempSync(join(tmpdir(),'missing-tls-'));clean.push(root);const file=join(root,'tls.json');
 writeFileSync(file,JSON.stringify({caFile:'ca.pem',certFile:'application.pem',keyFile:'absent.key'}));writeFileSync(join(root,'ca.pem'),'synthetic');writeFileSync(join(root,'application.pem'),'synthetic');
 await expect(loadApplicationTls(file)).rejects.toThrow('Application TLS keyFile could not be read (ENOENT).');
});
