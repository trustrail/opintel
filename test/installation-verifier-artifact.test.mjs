import {it,expect} from 'vitest';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import process from 'node:process';
it('VERIFY-01: the standalone internal archive runs without source files or node_modules and cannot pass missing prerequisites',()=>{
 const root=mkdtempSync(join(tmpdir(),'installation-verifier-')),artifact=join(root,'internal');try{
 execFileSync(process.execPath,['scripts/verification/verifier/package.mjs',artifact],{encoding:'utf8',timeout:30000});
 const metadata=JSON.parse(readFileSync(join(artifact,'artifact.json'),'utf8'));expect(metadata).toMatchObject({version:'1.0.0',internal:true,name:'opintel-installation-verifier'});
 expect(readdirSync(artifact).sort()).toEqual(['README.md','artifact.json','custody-agent.mjs','package.json','verify','verify.js']);
 expect(Object.keys(metadata.sourceHashes).some(k=>/^(src\/(modules|platform)|sidecar)\//u.test(k))).toBe(false);
 const standalone=JSON.parse(execFileSync(join(artifact,'verify'),['--list'],{cwd:artifact,encoding:'utf8',timeout:30000}));expect(standalone).toHaveLength(115);expect(new Set(standalone.map(c=>c.id)).size).toBe(115);
 const output=join(root,'missing'),config=join(root,'private.json');mkdirSync(output,{mode:0o700});writeFileSync(config,'{}',{mode:0o600});
 const result=spawnSync(join(artifact,'verify'),['--config',config,'--output',output,'--all'],{cwd:artifact,encoding:'utf8',timeout:30000});expect(result.status).toBe(1);
 const report=JSON.parse(readFileSync(join(output,'result.json'),'utf8'));expect(report.status).toBe('failed');expect(report.complete).toBe(true);expect(report.counts).toEqual({selected:115,passed:0,failed:0,notExercised:115});
 }finally{rmSync(root,{recursive:true,force:true});}
},60000);
