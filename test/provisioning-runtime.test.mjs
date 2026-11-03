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
  expect(Object.keys(manifest.artifacts).sort()).toEqual(['scripts/steps/main.js','scripts/steps/device-worker.mjs','scripts/steps/identity-exchange.js','native/LICENSE','native/duckdb.node',process.platform==='darwin'?'native/libduckdb.dylib':'native/libduckdb.so','package.json','scripts/operator/engine-sources.js','scripts/operator/provision.js','scripts/operator/ingress-tls.js','scripts/operator/customer-install.js','scripts/operator/customer-operator.js','scripts/operator/xq-worker.mjs','src/platform/ops/owner-claim.js'].sort());
  // Stage 4 shares the image with provisioning. Owner claim itself must still
  // start without the native runtime or another operator entrypoint present.
  rmSync(join(directory,'native'),{recursive:true});
  for(const step of ['query','redeem-and-unseal','grant-access','sign-in'])expect(execFileSync(process.execPath,[join(directory,'scripts/steps/main.js'),step,'--help'],{cwd:directory,env:{PATH:process.env.PATH,NODE_ENV:'production'},encoding:'utf8'})).toContain('./steps '+step);
  rmSync(join(directory,'scripts'),{recursive:true});
  const result=execFileSync(process.execPath,[join(directory,'src/platform/ops/owner-claim.js'),'--help'],{cwd:directory,env:{PATH:process.env.PATH,NODE_ENV:'production'},encoding:'utf8'});
  expect(result).toContain('claim expires after 24 hours');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
