import {mkdtempSync,mkdirSync,readdirSync,writeFileSync,copyFileSync,chmodSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {it,expect} from 'vitest';
it('agent kit imports with an explicit private API-key file and no key in Docker arguments',()=>{
 const root=mkdtempSync(join(tmpdir(),'customer-agent-key-'));
 try{
  mkdirSync(join(root,'bin'));writeFileSync(join(root,'images.list'),'');writeFileSync(join(root,'bootstrap.image'),'synthetic-bootstrap');writeFileSync(join(root,'platform'),'linux/'+(process.arch==='arm64'?'arm64':'amd64'));
  copyFileSync('deploy/agent-kit/command',join(root,'identities'));chmodSync(join(root,'identities'),0o755);
  const key=join(root,'api-key'),zip=join(root,'device-223.zip');writeFileSync(zip,'fixture');writeFileSync(key,'private-fixture-key',{mode:0o600});
  writeFileSync(join(root,'bin/docker'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_DOCKER_LOG"\nexit 0\n',{mode:0o755});
  const result=spawnSync(join(root,'identities'),['add',zip,'--device','fixture-device','--api-key-file',key],{encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,MOCK_DOCKER_LOG:join(root,'calls')}});
  expect(result.status,result.stderr).toBe(0);const calls=readFileSync(join(root,'calls'),'utf8'),exchange=calls.split('\n').find(line=>line.includes('scripts/agent/identities.js add'));
  expect(exchange).toContain(`--user ${process.getuid()}:${process.getgid()}`);expect(exchange).toContain(`-v ${key}:/input/api-key:ro`);expect(calls).not.toContain('private-fixture-key');expect(statSync(join(root,'xq-api-key')).mode&0o777).toBe(0o600);
 }finally{rmSync(root,{recursive:true,force:true});}
});
it.each(['identities','steps'])('agent %s job gives device unwrap private memory-backed temporary storage',command=>{
 const root=mkdtempSync(join(tmpdir(),'customer-agent-memory-'));
 try{
  mkdirSync(join(root,'bin'));for(const name of ['release.json','images.list'])writeFileSync(join(root,name),'');
  writeFileSync(join(root,'bootstrap.image'),'synthetic-bootstrap');writeFileSync(join(root,'package-kind'),'gateway');writeFileSync(join(root,'platform'),'linux/'+(process.arch==='arm64'?'arm64':'amd64'));
  copyFileSync('deploy/agent-kit/command',join(root,command));chmodSync(join(root,command),0o755);
  writeFileSync(join(root,'bin/docker'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_DOCKER_LOG"\nexit 0\n',{mode:0o755});
  const zip=join(root,'device-223.zip'),key=join(root,'api-key');writeFileSync(zip,'fixture');writeFileSync(key,'private-fixture-key',{mode:0o600});
  const result=spawnSync(join(root,command),command==='identities'?['add',zip,'--device','fixture-device','--api-key-file',key]:['query','--help'],{encoding:'utf8',input:'',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,MOCK_DOCKER_LOG:join(root,'calls')}});
  expect(result.status,result.stderr).toBe(0);const calls=readFileSync(join(root,'calls'),'utf8').split('\n'),agent=calls.find(line=>line.includes(command==='identities'?'scripts/agent/identities.js add':'scripts/agent/main.js query'));
  expect(agent).toContain(`--read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=0700,uid=${process.getuid()},gid=${process.getgid()}`);
  expect(agent).toContain('--cap-drop ALL --security-opt no-new-privileges');expect(calls.join('\n')).not.toContain('private-fixture-key');
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('DEP-018: startup stops at a failed migration and retains private diagnostics',()=>{
 const root=mkdtempSync(join(tmpdir(),'customer-command-'));
 try{
  mkdirSync(join(root,'state'),{mode:0o700});mkdirSync(join(root,'bin'));
  for(const name of ['release.json','images.list','state/compose.json','state/package.env'])writeFileSync(join(root,name),'');
  writeFileSync(join(root,'state/project-name'),'opintel-test');
  writeFileSync(join(root,'bootstrap.image'),'synthetic-bootstrap');writeFileSync(join(root,'package-kind'),'gateway');writeFileSync(join(root,'platform'),'linux/'+(process.arch==='arm64'?'arm64':'amd64'));
  copyFileSync('deploy/customer/command',join(root,'start'));chmodSync(join(root,'start'),0o755);
  writeFileSync(join(root,'bin/docker'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_DOCKER_LOG"\ncase "$*" in *" migrations "*) echo "synthetic migration failure" >&2; exit 23;; esac\nexit 0\n',{mode:0o755});
  const result=spawnSync(join(root,'start'),[],{encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,COMPOSE_PROJECT_NAME:'foreign-project',MOCK_DOCKER_LOG:join(root,'calls')}});
  expect(result.status).not.toBe(0);expect(result.stderr).toContain('state/operations/start-');expect(result.stdout).not.toContain('synthetic migration failure');
  const log=join(root,'state/operations',readdirSync(join(root,'state/operations'))[0]);expect(readFileSync(log,'utf8')).toContain('synthetic migration failure');expect(statSync(log).mode&0o077).toBe(0);
  const calls=readFileSync(join(root,'calls'),'utf8');expect(calls).toContain('--project-name opintel-test');expect(calls).toContain('--interactive=false -T migrations');expect(calls).not.toContain('spicedb-migrate');expect(calls).not.toContain('api console ingress');
 }finally{rmSync(root,{recursive:true,force:true});}
});
it.each([false,true])('DEP-XQ-200: packaged provider check propagates operator failure=%s without launching verification jobs',failure=>{
 const root=mkdtempSync(join(tmpdir(),'customer-xq-check-'));
 try{
  mkdirSync(join(root,'state'));mkdirSync(join(root,'bin'));for(const name of ['release.json','images.list','state/compose.json','state/package.env'])writeFileSync(join(root,name),'');
  writeFileSync(join(root,'state/project-name'),'opintel-test');writeFileSync(join(root,'bootstrap.image'),'synthetic-bootstrap');writeFileSync(join(root,'platform'),'linux/'+(process.arch==='arm64'?'arm64':'amd64'));
  copyFileSync('deploy/customer/command',join(root,'xq-check'));chmodSync(join(root,'xq-check'),0o755);
  writeFileSync(join(root,'bin/docker'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_DOCKER_LOG"\nif [ "$MOCK_FAIL" = yes ]; then case "$*" in *"-T operator "*) exit 23;; esac; fi\nexit 0\n',{mode:0o755});
  const result=spawnSync(join(root,'xq-check'),[],{encoding:'utf8',input:'must not be consumed\n',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,MOCK_DOCKER_LOG:join(root,'calls'),MOCK_FAIL:failure?'yes':'no'}});
  expect(result.status).toBe(failure?23:0);const calls=readFileSync(join(root,'calls'),'utf8');expect(calls).toContain('--interactive=false -T operator node scripts/operator/customer-operator.js xq-check');expect(calls).not.toContain('demo-tools');
 }finally{rmSync(root,{recursive:true,force:true});}
});
it.each(['shorter','longer'])('upgrade survives a %s replacement of its running entrypoint',length=>{
 const root=mkdtempSync(join(tmpdir(),'customer-upgrade-replacement-'));
 try{
  const install=join(root,'install'),next=join(root,'next'),bin=join(root,'bin');
  for(const directory of [install,next,bin,join(install,'state')])mkdirSync(directory,{recursive:true});
  const script=readFileSync('deploy/customer/command','utf8');
  writeFileSync(join(install,'upgrade'),script,{mode:0o755});
  const replacement=`#!/usr/bin/env bash\nprintf '%s\\n' '${'replacement '.repeat(length==='longer'?script.length:1)}'\nexit 91\n`;
  writeFileSync(join(next,'upgrade'),replacement,{mode:0o755});
  writeFileSync(join(next,'zzz-last-payload'),'new payload');
  for(const directory of [install,next]){
   for(const name of ['release.json','images.list','images.tar','trust.json'])writeFileSync(join(directory,name),'');
   writeFileSync(join(directory,'bootstrap.image'),'synthetic-bootstrap');
   writeFileSync(join(directory,'package-kind'),'gateway');
   writeFileSync(join(directory,'platform'),'linux/'+(process.arch==='arm64'?'arm64':'amd64'));
  }
  for(const name of ['compose.json','package.env','volumes.list'])writeFileSync(join(install,'state',name),'');
  writeFileSync(join(install,'state/project-name'),'upgrade-test');
  writeFileSync(join(bin,'docker'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_DOCKER_LOG"\nexit 0\n',{mode:0o755});
  writeFileSync(join(bin,'cp'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_COPY_LOG"\nexec /bin/cp "$@"\n',{mode:0o755});
  const result=spawnSync('/bin/bash',[join(install,'upgrade'),next],{encoding:'utf8',timeout:10000,env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_DOCKER_LOG:join(root,'calls'),MOCK_COPY_LOG:join(root,'copies')}});
  expect(result.status,result.stderr).toBe(0);expect(result.stderr).toBe('');
  expect(result.stdout).toContain('Services are healthy.');expect(result.stdout).not.toMatch(/^replacement /m);
  expect(readFileSync(join(install,'upgrade'),'utf8')).toBe(replacement);
  expect(readFileSync(join(install,'zzz-last-payload'),'utf8')).toBe('new payload');
  expect(readFileSync(join(root,'copies'),'utf8').trim().split('\n').at(-1)).toBe(`-p ${next}/upgrade ${install}/upgrade`);
  const calls=readFileSync(join(root,'calls'),'utf8');
  expect(calls).toContain('customer-install.js upgrade gateway');expect(calls).toContain('customer-install.js status gateway');
 }finally{rmSync(root,{recursive:true,force:true});}
});
