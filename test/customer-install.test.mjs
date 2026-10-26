import {mkdtempSync,rmSync,readFileSync,writeFileSync,statSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
import {checkBinding} from '../src/modules/release-custody/infrastructure/availability.js';
import {afterEach,it,expect} from 'vitest';
import {packageDeployment} from '../scripts/images/package.mjs';
import {auditPackage} from '../scripts/images/package-audit.mjs';
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
 expect(statSync(join(directory,'state')).mode&0o077).toBe(0);expect(statSync(join(directory,'state/runtime.env')).mode&0o077).toBe(0);expect(statSync(join(directory,'state',kind==='gateway'?'application-tls.json':'service.json')).mode&0o777).toBe(0o644);expect(statSync(join(directory,'state/xq')).mode&0o777).toBe(0o755);
 const result=spawnSync('docker',['compose','--project-name',readFileSync(join(directory,'state/project-name'),'utf8').trim(),'--env-file',join(directory,'state/package.env'),'-f',join(directory,'state/compose.json'),'config','--format','json'],{encoding:'utf8',stdio:'pipe',env:{...process.env,COMPOSE_PROJECT_NAME:'foreign-project'}});
 expect(result.status).toBe(0);expect(result.stderr).toBe('');
 const config=JSON.parse(result.stdout);expect(config.name).toMatch(new RegExp('^opintel-'+kind+'-'));for(const service of Object.values(config.services)){expect(service.pull_policy).toBe('never');expect(service.stdin_open).not.toBe(true);}
 if(kind==='gateway'){expect(config.services.console.ports).toBeUndefined();expect(config.services.ingress.ports[0].published).toBe('443');expect(before).toContain('PAL_PROVIDER=\'disabled\'');expect(before).not.toContain('MIGRATION_DATABASE_URL');expect(readFileSync(join(directory,'state/operator.env'),'utf8')).toContain("OPINTEL_OPERATOR_API_TARGET='https://ingress:8444'");expect(readFileSync(join(directory,'state/operator.env'),'utf8')).toContain("OPINTEL_API_BASE_URL='https://192.0.2.10'");expect(config.services.ingress.ports).toHaveLength(1);const binding=values=>checkBinding({provider:'xq',tenant:'synthetic',region:'us-east-1'},{apiKey:values.OPINTEL_XQ_API_KEY,dashboardApiKey:values.OPINTEL_XQ_DASHBOARD_API_KEY,dashboardAccessToken:'',senderAlias:values.OPINTEL_XQ_SENDER_ALIAS,senderAccessToken:values.OPINTEL_XQ_SENDER_ACCESS_TOKEN,master:values.OPINTEL_CUSTODY_MASTER_KEY,redeemAt:values.OPINTEL_XQ_REDEEM_URL,applicationUrl:values.OPINTEL_API_BASE_URL});expect(binding(parse(before))).toBe(binding(parse(readFileSync(join(directory,'state/operator.env')))));}
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

it('DEP-018: same-host pairing uses Docker host routing while split-host pairing retains the LAN address',()=>{
 for(const local of [true,false]){
  const {directory,run}=packageRoot('gateway');run('initialize');
  const identity=JSON.parse(readFileSync(join(directory,'trust.json'),'utf8'));identity.kind='engine';identity.address='https://'+(local?'192.0.2.10':'192.0.2.11')+':3100';identity.demoSourceUrl='postgresql://synthetic:synthetic@'+(local?'192.0.2.10':'192.0.2.11')+':5434/readiness';
  writeFileSync(join(directory,'state/incoming.json'),JSON.stringify(identity));
  execFileSync(process.execPath,['--import','tsx','scripts/operator/customer-install.ts','pair','gateway',identity.pin],{env:{...process.env,PACKAGE_HOST_DIRECTORY:directory,OPINTEL_INSTALL_ROOT:directory},stdio:'pipe'});
  expect(JSON.parse(readFileSync(join(directory,'state/output/peer.json'),'utf8')).address).toBe(local?'https://host.docker.internal:3100':identity.address);
  expect(readFileSync(join(directory,'state/package.env'),'utf8')).toContain(local?'https://host.docker.internal:3102':'https://192.0.2.10:3102');
 }
},60000);
