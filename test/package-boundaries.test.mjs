import {expect,it} from 'vitest';
import {assertPackageInputs} from '../scripts/engine-package/package-boundaries.mjs';
import {verificationConfig} from '../scripts/images/verification-config.mjs';
it.each(['api','engine','console','egress','migrations','provisioning'])('%s rejects misplaced agent and verification inputs',target=>{
 for(const file of ['scripts/agent/main.ts','scripts/operator/identity-import.ts','scripts/steps/infrastructure/device.ts','scripts/verification/steps/main.ts','scripts/operator/demo.ts','scripts/operator/reinsurance.ts','scripts/soak/agent.ts'])expect(()=>assertPackageInputs(target,[file])).toThrow('Package boundary');
 expect(()=>assertPackageInputs(target,['src/shared/api/mcp.ts'])).not.toThrow();
});
it('agent and verification entrypoints cannot cross package ownership',()=>{
 expect(()=>assertPackageInputs('agent-kit',['scripts/verification/steps/main.ts'])).toThrow();expect(()=>assertPackageInputs('demo-tools',['scripts/agent/main.ts'])).toThrow();
 expect(()=>assertPackageInputs('agent-kit',['scripts/agent/main.ts','scripts/steps/infrastructure/device.ts'])).not.toThrow();
});
it('agent and verification bundles start independently and contain their own worker only',async()=>{
 const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'opintel-separated-bundles-'));
 try{
  for(const target of ['agent-kit','demo-tools']){
   const directory=join(root,target);execFileSync(process.execPath,['scripts/engine-package/bundle.mjs',target,directory],{encoding:'utf8'});
   const manifest=JSON.parse(readFileSync(join(directory,'runtime-manifest.json'),'utf8'));
   if(target==='agent-kit'){
    expect(manifest.artifacts).toHaveProperty('scripts/agent/device-worker.mjs');expect(Object.keys(manifest.artifacts).some(name=>name.includes('verification'))).toBe(false);
    expect(execFileSync(process.execPath,[join(directory,'scripts/agent/main.js'),'--help'],{encoding:'utf8'})).toContain('query');
   }else{
    expect(manifest.artifacts).toHaveProperty('scripts/operator/device-worker.mjs');expect(Object.keys(manifest.artifacts).some(name=>name.startsWith('scripts/agent/'))).toBe(false);
    expect(execFileSync(process.execPath,[join(directory,'scripts/verification/steps/main.js'),'--help'],{encoding:'utf8'})).toContain('grant-access');
   }
  }
 }finally{rmSync(root,{force:true,recursive:true});}
},60000);

it('verification soak launches from its own private config and signed-in session without gateway operator environment',async()=>{
 const {mkdtempSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'opintel-verification-config-'));
 try{
  mkdirSync(join(root,'bin'));mkdirSync(join(root,'output'));
  for(const [name,value] of [['bootstrap.image','verification-image'],['platform','linux/amd64'],['images.list','']])writeFileSync(join(root,name),value+'\n');
  copyFileSync('deploy/verification/command',join(root,'demo'));
  const runtime=Object.fromEntries(['DATABASE_URL','REDIS_URL','SPICEDB_ENDPOINT','SPICEDB_TOKEN','OPINTEL_CUSTODY_MASTER_KEY'].map(k=>[k,'fixture-'+k]));
  const provider=Object.fromEntries(['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'].map(k=>[k,'fixture-'+k]));
  const vars=verificationConfig({runtime:{...runtime,UNRELATED_GATEWAY_SECRET:'excluded'},provider,ownerEmail:'owner@example.test',applicationUrl:'https://gateway.example.test',heartbeatUrl:'https://gateway.example.test:3102'});
  expect(vars.ENGINE_HEARTBEAT_URL).toBe('https://gateway.example.test:3102');expect(vars.APPLICATION_TLS_CONFIG).toBe('/config/application-tls.json');expect(vars.OPINTEL_PACKAGED_SOAK).toBe('1');expect(vars).not.toHaveProperty('UNRELATED_GATEWAY_SECRET');
  writeFileSync(join(root,'verification.env'),Object.entries(vars).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
  writeFileSync(join(root,'output/owner.cookie'),'opintel_session=fixture\n',{mode:0o600});
  writeFileSync(join(root,'bin/docker'),`#!/bin/sh\ncase "$1 $2" in 'image inspect') exit 0;; esac\nprintf '%s\\n' "$*" > "$TEST_CALLS"\ncase "$*" in *'--env-file '*verification.env*'customer-soak 120'*'--session-file /output/owner.cookie'*) ;; *) exit 21;; esac\ngrep -q '^ENGINE_HEARTBEAT_URL=https://gateway.example.test:3102$' "$TEST_CONFIG" || exit 22\ngrep -q '^OPINTEL_PACKAGED_SOAK=1$' "$TEST_CONFIG" || exit 23\ntest -f "$TEST_SESSION" || exit 24\nprintf 'verification soak started\\n'\n`,{mode:0o755});
  const output=spawnSync('/bin/bash',[join(root,'demo'),'soak','120','--target-file','/output/source-uri','--source-ref','secret://sources/v01','--session-file','/output/owner.cookie'],{encoding:'utf8',env:{PATH:join(root,'bin')+':/usr/bin:/bin',TEST_CALLS:join(root,'calls'),TEST_CONFIG:join(root,'verification.env'),TEST_SESSION:join(root,'output/owner.cookie')}});
  expect(output.status,output.stderr).toBe(0);expect(output.stdout).toContain('verification soak started');expect(readFileSync(join(root,'calls'),'utf8')).not.toContain('GATEWAY_OPERATOR_ENV_FILE');
  expect(()=>verificationConfig({runtime,provider,ownerEmail:'owner@example.test',applicationUrl:'https://gateway.example.test',heartbeatUrl:''})).toThrow('ENGINE_HEARTBEAT_URL');
 }finally{rmSync(root,{force:true,recursive:true});}
});
