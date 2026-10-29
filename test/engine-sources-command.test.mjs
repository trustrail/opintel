import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,chmodSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {it,expect} from 'vitest';
it('ES-007: package automation keeps literal password bytes out of argv/output and cleans the private job input',()=>{
 const root=mkdtempSync(join(tmpdir(),'engine-sources-command-'));
 try{
  mkdirSync(join(root,'state'),{mode:0o700});mkdirSync(join(root,'bin'));
  for(const file of ['release.json','images.list','state/installed.json'])writeFileSync(join(root,file),'{}');
  writeFileSync(join(root,'package-kind'),'engine');writeFileSync(join(root,'platform'),'linux/'+(process.arch==='arm64'?'arm64':'amd64'));writeFileSync(join(root,'bootstrap.image'),'synthetic-bootstrap');
  copyFileSync('deploy/customer/command',join(root,'sources'));chmodSync(join(root,'sources'),0o755);
  const password=' synthetic!$#%= ';writeFileSync(join(root,'password'),password,{mode:0o600});
  const mock=`#!${process.execPath}
const {spawnSync}=require('node:child_process'),{appendFileSync}=require('node:fs');
const args=process.argv.slice(2);appendFileSync(process.env.MOCK_DOCKER_LOG,JSON.stringify(args)+'\\n');if(args[0]==='info')process.exit(0);
if(args[0]!=='run'||!args.includes('--network')||args[args.indexOf('--network')+1]!=='none')process.exit(5);
const at=args.indexOf('scripts/operator/engine-sources.js');if(at<0)process.exit(6);
const input=args.slice(at+1).map(v=>v.replace('/package/',process.env.MOCK_PACKAGE+'/'));
const result=spawnSync(process.execPath,['--import','tsx',process.env.MOCK_ENTRY,...input],{cwd:process.env.MOCK_REPOSITORY,stdio:'inherit',env:{...process.env,ENGINE_SOURCE_SECRETS_DIRECTORY:process.env.MOCK_PACKAGE+'/state/sources'}});process.exit(result.status??1);
`;
  writeFileSync(join(root,'bin/docker'),mock,{mode:0o755});
  const env={...process.env,PATH:join(root,'bin')+':'+process.env.PATH,MOCK_DOCKER_LOG:join(root,'calls'),MOCK_PACKAGE:root,MOCK_REPOSITORY:process.cwd(),MOCK_ENTRY:resolve('scripts/operator/engine-sources.ts')};
  const run=args=>spawnSync(join(root,'sources'),args,{env,encoding:'utf8',input:'never consumed\n'});
  const added=run(['add','warehouse','--host','localhost','--port','5432','--database','customer','--user','reader','--password-file',join(root,'password')]);expect(added.status,added.stderr).toBe(0);expect(added.stdout).toBe('secret://sources/warehouse\n');expect(added.stderr).toBe('');
  expect(decodeURIComponent(new URL(readFileSync(join(root,'state/sources/warehouse'),'utf8')).password)).toBe(password);
  expect(readFileSync(join(root,'calls'),'utf8')).not.toContain(password);expect(readdirSync(join(root,'state/operations'))).toEqual([]);
  expect(run(['list']).stdout).toBe('warehouse\n');expect(run(['remove','warehouse']).status).toBe(0);expect(run(['list']).stdout).toBe('');
 }finally{rmSync(root,{recursive:true,force:true});}
});
