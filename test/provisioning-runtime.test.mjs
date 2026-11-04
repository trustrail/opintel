import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,cpSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {expect,it} from 'vitest';
it('DEP-008: compiled owner-claim starts without DuckDB, source files or node_modules',()=>{
 const directory=mkdtempSync(join(tmpdir(),'opintel-owner-runtime-'));
 try{
  // Match the actual Docker build inputs: a full checkout hides missing COPYs.
  const context=join(directory,'build-context');mkdirSync(context);
  const dockerfile=readFileSync('deploy/engine/Dockerfile','utf8');let stage='';
  for(const line of dockerfile.split('\n')){
   if(line.startsWith('FROM '))stage=line.match(/ AS (\S+)$/u)?.[1]??'';
   if(!['toolchain','provisioning-build'].includes(stage)||!line.startsWith('COPY '))continue;
   const parts=line.split(/\s+/u).slice(1).filter(part=>!part.startsWith('--')),destination=parts.pop();
   if(!destination)throw new Error('Missing Docker COPY destination');
   const target=join(context,destination);mkdirSync(target,{recursive:true});
   for(const source of parts){const input=resolve(source);if(source==='tsconfig.json'||source==='package.json'||source==='package-lock.json'||destination.endsWith('/'))cpSync(input,join(target,basename(source)),{recursive:true});else cpSync(input,target,{recursive:true});}
  }
  symlinkSync(resolve('node_modules'),join(context,'node_modules'),'dir');
  execFileSync(process.execPath,[join(context,'scripts/engine-package/bundle.mjs'),'provisioning',directory],{cwd:context,encoding:'utf8'});
  rmSync(context,{recursive:true,force:true});
  const manifest=JSON.parse(readFileSync(join(directory,'runtime-manifest.json'),'utf8'));
  expect(Object.keys(manifest.artifacts).sort()).toEqual(['native/LICENSE','native/duckdb.node',process.platform==='darwin'?'native/libduckdb.dylib':'native/libduckdb.so','package.json','scripts/operator/engine-sources.js','scripts/operator/ingress-tls.js','scripts/operator/customer-install.js','scripts/operator/customer-operator.js','scripts/operator/xq-worker.mjs','src/platform/ops/owner-claim.js'].sort());
  // Stage 4 shares the image with provisioning. Owner claim itself must still
  // start without the native runtime or another operator entrypoint present.
  rmSync(join(directory,'native'),{recursive:true});
  rmSync(join(directory,'scripts'),{recursive:true});
  const result=execFileSync(process.execPath,[join(directory,'src/platform/ops/owner-claim.js'),'--help'],{cwd:directory,env:{PATH:process.env.PATH,NODE_ENV:'production'},encoding:'utf8'});
  expect(result).toContain('claim expires after 24 hours');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
it('packaged non-root key writer and agent reader share a mode-600 key and writable private diagnostic mount',()=>{
 const directory=mkdtempSync(join(tmpdir(),'opintel-agent-key-runtime-'));
 try{
  execFileSync(process.execPath,['scripts/engine-package/bundle.mjs','agent-kit',directory],{encoding:'utf8'});
  const image=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'))['x-build-images'].nodeRuntime,uid=process.getuid(),gid=process.getgid();
  // Linux tmpfs enforces UID ownership; macOS file sharing remaps host bind access.
  // Root prepares the fixture only. Every writer/reader below uses the packaged UID.
  const fixture=`const fs=require('node:fs'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
   const uid=Number(process.argv[1]),gid=Number(process.argv[2]);assert.notEqual(uid,0);
   for(const path of ['/input','/output','/package/diagnostics']){fs.mkdirSync(path,{recursive:true,mode:0o700});fs.chmodSync(path,0o700);fs.chownSync(path,uid,gid);}
   fs.writeFileSync('/input/package.env','OPINTEL_XQ_API_KEY=synthetic-runtime-key\\n',{mode:0o600});fs.chownSync('/input/package.env',uid,gid);
   const run=(user,args)=>spawnSync(process.execPath,args,{uid:user,gid:user===uid?gid:gid+1,encoding:'utf8',env:{...process.env,OPINTEL_AGENT_ROOT:'/package'}});
   const write=['-e',"const fs=require('node:fs');fs.writeFileSync('/output/api-key','synthetic-runtime-key',{mode:0o600,flag:'wx'});"];
   let result=run(uid,write);assert.equal(result.status,0,result.stderr);
   result=run(uid,['-e',"const fs=require('node:fs'),assert=require('node:assert/strict'),s=fs.statSync('/output/api-key');assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o777,0o600);assert.ok(fs.readFileSync('/output/api-key').length>0);"]);assert.equal(result.status,0,result.stderr);
   result=run(uid+1,['-e',"const fs=require('node:fs'),assert=require('node:assert/strict');assert.throws(()=>fs.readFileSync('/output/api-key'),{code:'EACCES'});"]);assert.equal(result.status,0,result.stderr);
   result=run(uid,['scripts/agent/identities.js','invalid']);assert.equal(result.status,1);assert.ok(result.stderr.includes('Log: /package/diagnostics/'));assert.ok(!result.stderr.includes('Diagnostic log could not be written'));
   result=run(uid,['-e',"const fs=require('node:fs'),assert=require('node:assert/strict'),logs=fs.readdirSync('/package/diagnostics');assert.equal(logs.length,1);const p='/package/diagnostics/'+logs[0],s=fs.statSync(p);assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o777,0o600);const log=fs.readFileSync(p,'utf8');assert.ok(log.includes('invalid input or refused exchange'));assert.ok(!log.includes('synthetic-runtime-key'));"]);assert.equal(result.status,0,result.stderr);
   process.stdout.write('Private key and diagnostic permissions verified.');`;
  const result=execFileSync('docker',['run','--rm','--network','none','--read-only','--user','0:0','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','DAC_OVERRIDE','--cap-add','SETUID','--cap-add','SETGID','--tmpfs','/input:rw,noexec,nosuid,nodev','--tmpfs','/output:rw,noexec,nosuid,nodev','--tmpfs','/package:rw,noexec,nosuid,nodev','--volume',`${directory}:/work:ro`,'--workdir','/work',image,'node','-e',fixture,String(uid),String(gid)],{encoding:'utf8',timeout:30000});
  expect(result).toContain('Private key and diagnostic permissions verified.');
 }finally{rmSync(directory,{recursive:true,force:true});}
},60000);
it('agent kit builds from its Docker COPY inputs without a full checkout',()=>{
 const directory=mkdtempSync(join(tmpdir(),'opintel-agent-context-'));
 try{
  const context=join(directory,'context'),output=join(directory,'output');mkdirSync(context);
  const dockerfile=readFileSync('deploy/engine/Dockerfile','utf8');let stage='';
  for(const line of dockerfile.split('\n')){
   if(line.startsWith('FROM '))stage=line.match(/ AS (\S+)$/u)?.[1]??'';
   if(!['toolchain','agent-kit-build'].includes(stage)||!line.startsWith('COPY '))continue;
   const parts=line.split(/\s+/u).slice(1).filter(part=>!part.startsWith('--')),destination=parts.pop();if(!destination)throw new Error('Missing Docker COPY destination');
   const target=join(context,destination);mkdirSync(target,{recursive:true});
   for(const source of parts){const input=resolve(source);if(source==='tsconfig.json'||source==='package.json'||source==='package-lock.json'||destination.endsWith('/'))cpSync(input,join(target,basename(source)),{recursive:true});else cpSync(input,target,{recursive:true});}
  }
  symlinkSync(resolve('node_modules'),join(context,'node_modules'),'dir');
  execFileSync(process.execPath,[join(context,'scripts/engine-package/bundle.mjs'),'agent-kit',output],{cwd:context,encoding:'utf8'});
  rmSync(context,{recursive:true,force:true});
  expect(execFileSync(process.execPath,[join(output,'scripts/agent/main.js'),'--help'],{cwd:output,encoding:'utf8'})).toContain('query');
  expect(execFileSync(process.execPath,[join(output,'scripts/agent/identities.js'),'--help'],{cwd:output,encoding:'utf8'})).toContain('identities add');
 }finally{rmSync(directory,{recursive:true,force:true});}
},60000);
