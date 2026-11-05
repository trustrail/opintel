import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

// One diagnostic invocation of the standard harness; restore the gate config
// byte-for-byte even when the diagnostic fails. Never used by the gate.
const path='playwright.smoke.config.ts',original=readFileSync(path,'utf8');
const directory='tmp/console03-smoke-120';
mkdirSync(directory,{recursive:true});
const diagnostic=original.replace('defineConfig({...base,',`defineConfig({...base,timeout:120000,outputDir:'${directory}/artifacts',`).replace("trace:'retain-on-failure'","trace:'on'").replace("reporter:[['list']]",`reporter:[['list'],['json',{outputFile:'${directory}/result.json'}]]`);
if(diagnostic===original)throw new Error('Smoke configuration did not match diagnostic override.');
const started=Date.now();
try{
 writeFileSync(path,diagnostic);
 const result=spawnSync('npm',['run','test:smoke'],{stdio:'inherit',env:process.env});
 process.exitCode=result.status??1;
 writeFileSync(`${directory}/invocation.json`,JSON.stringify({startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started,exitCode:process.exitCode},null,2)+'\n');
}finally{writeFileSync(path,original);}
