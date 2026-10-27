import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {it,expect} from 'vitest';

it.each([
 {name:'missing revision',args:[],architecture:'arm64',docker:'arm64',message:'revision argument is required'},
 {name:'wrong architecture',args:['synthetic'],architecture:'x86_64',docker:'arm64',message:'architecture: native arm64 required; found x86_64'},
 {name:'Docker unavailable',args:['synthetic'],architecture:'arm64',docker:'unavailable',message:'Docker: daemon unavailable'},
 {name:'wrong Docker architecture',args:['synthetic'],architecture:'arm64',docker:'x86_64',message:'Docker architecture: arm64 required; found x86_64'},
 {name:'explicit provider path missing',args:['synthetic','--provider-env','/nonexistent/opintel-provider-fixture.env'],architecture:'arm64',docker:'arm64',message:'provider file is not a readable file: /nonexistent/opintel-provider-fixture.env'},
 {name:'missing flag value',args:['synthetic','--provider-env'],architecture:'arm64',docker:'arm64',message:'--provider-env requires a file path'},
])('native release names $name and always reports its outputs',({args,architecture,docker,message})=>{
 const root=mkdtempSync(join(tmpdir(),'native-release-'));
 try{
  const directory=join(root,'scripts/release');mkdirSync(directory,{recursive:true});mkdirSync(join(root,'bin'));
  const script=join(directory,'native.sh');copyFileSync('scripts/release/native.sh',script);
  writeFileSync(join(root,'bin/uname'),'#!/bin/sh\nprintf "%s\\n" "$NATIVE_TEST_ARCH"\n',{mode:0o755});
  writeFileSync(join(root,'bin/docker'),'#!/bin/sh\n[ "$NATIVE_TEST_DOCKER" != unavailable ] || exit 1\nprintf "%s\\n" "$NATIVE_TEST_DOCKER"\n',{mode:0o755});
  for(const tool of ['git','node','npm','make','python3','openssl','tar'])writeFileSync(join(root,'bin',tool),'#!/bin/sh\nexit 98\n',{mode:0o755});
  const result=spawnSync('/bin/bash',[script,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,NATIVE_TEST_ARCH:architecture,NATIVE_TEST_DOCKER:docker},timeout:5000});
  expect(result.status).toBe(1);expect(result.stderr).toContain('Precondition failed: '+message);
  expect(result.stdout).toContain('Phase: arguments');expect(result.stdout).toContain('Run directory: not created (preflight failed)');expect(result.stdout.match(/Archive: not produced/gu)).toHaveLength(2);expect(result.stdout.trim()).toMatch(/Acceptance result: not produced$/u);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it('native release names a loopback host process before builds or certificate access',()=>{
 const root=mkdtempSync(join(tmpdir(),'native-listener-'));
 try{
  mkdirSync(join(root,'scripts/release'),{recursive:true});mkdirSync(join(root,'bin'));
  const script=join(root,'scripts/release/native.sh');copyFileSync('scripts/release/native.sh',script);
  writeFileSync(join(root,'.env'),'# synthetic provider file\n');
  writeFileSync(join(root,'bin/uname'),'#!/bin/sh\necho arm64\n',{mode:0o755});
  writeFileSync(join(root,'bin/docker'),'#!/bin/sh\n[ "$1" != info ] || echo arm64\nexit 0\n',{mode:0o755});
  writeFileSync(join(root,'bin/lsof'),'#!/bin/sh\ncase "$*" in *-iTCP:3100*) echo "node 3175 operator TCP 127.0.0.1:3100 (LISTEN)";; *) exit 1;; esac\n',{mode:0o755});
  const result=spawnSync('/bin/bash',[script,'synthetic'],{encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH},stdio:['ignore','pipe','pipe'],timeout:5000});
  expect(result.status).toBe(1);expect(result.stderr).toContain('acceptance port 3100 has a host listener: node 3175');expect(result.stdout).toContain('Acceptance result: not produced');
 }finally{rmSync(root,{recursive:true,force:true});}
});
