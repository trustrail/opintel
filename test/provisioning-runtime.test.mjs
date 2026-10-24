import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
it('DEP-008: compiled owner-claim starts without DuckDB, source files or node_modules',()=>{
 const directory=mkdtempSync(join(tmpdir(),'opintel-owner-runtime-'));
 try{
  execFileSync(process.execPath,['scripts/engine-package/bundle.mjs','provisioning',directory],{encoding:'utf8'});
  const manifest=JSON.parse(readFileSync(join(directory,'runtime-manifest.json'),'utf8'));
  expect(Object.keys(manifest.artifacts).sort()).toEqual(['package.json','src/platform/ops/owner-claim.js']);
  const result=execFileSync(process.execPath,[join(directory,'src/platform/ops/owner-claim.js'),'--help'],{cwd:directory,env:{PATH:process.env.PATH,NODE_ENV:'production'},encoding:'utf8'});
  expect(result).toContain('claim expires after 24 hours');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
