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
