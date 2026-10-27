import {mkdtempSync,mkdirSync,readdirSync,writeFileSync,copyFileSync,chmodSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {it,expect} from 'vitest';
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
it.each([null,'operator','demo-tools'])('DEP-XQ-200: packaged check propagates %s failure and uses noninteractive jobs',failure=>{
 const root=mkdtempSync(join(tmpdir(),'customer-xq-check-'));
 try{
  mkdirSync(join(root,'state'));mkdirSync(join(root,'bin'));
  for(const name of ['release.json','images.list','state/compose.json','state/package.env'])writeFileSync(join(root,name),'');
  writeFileSync(join(root,'state/project-name'),'opintel-test');writeFileSync(join(root,'bootstrap.image'),'synthetic-bootstrap');writeFileSync(join(root,'platform'),'linux/'+(process.arch==='arm64'?'arm64':'amd64'));
  copyFileSync('deploy/customer/command',join(root,'xq-check'));chmodSync(join(root,'xq-check'),0o755);
  writeFileSync(join(root,'bin/docker'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_DOCKER_LOG"\nif [ -n "$MOCK_FAIL_SERVICE" ]; then case "$*" in *"-T $MOCK_FAIL_SERVICE "*) exit 23;; esac; fi\nexit 0\n',{mode:0o755});
  const result=spawnSync(join(root,'xq-check'),['--roundtrips','200'],{encoding:'utf8',input:'must not be consumed\n',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,MOCK_DOCKER_LOG:join(root,'calls'),MOCK_FAIL_SERVICE:failure??''}});
  expect(result.status).toBe(failure?23:0);
  const calls=readFileSync(join(root,'calls'),'utf8');expect(calls).toContain('--interactive=false -T operator node scripts/operator/customer-operator.js xq-check');
  if(failure==='operator')expect(calls).not.toContain('xq-roundtrip');else expect(calls).toContain('--interactive=false -T demo-tools node scripts/operator/demo.js xq-roundtrip 200');
 }finally{rmSync(root,{recursive:true,force:true});}
});
