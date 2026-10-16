import console from 'node:console';
import process from 'node:process';
import {performance} from 'node:perf_hooks';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
async function isolation(tier){
 const checks=[];
 for(const port of [3000,3100,3101,4173,5173]){
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
  checks.push({port,available:true});
 }
 mkdirSync('test-results',{recursive:true});
 writeFileSync(`test-results/isolation-${tier}.json`,JSON.stringify({at:new Date().toISOString(),checks},null,2)+'\n');
}

const commit=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const start=performance.now(),tiers=[];
// Sequential; never retry a tier or run domains concurrently with smoke setup.
const scripts=['typecheck','typecheck:conformance','lint','build:production','test:conformance','test','test:smoke'];
for(const script of scripts){
 if(script==='test:conformance'||script==='test:smoke')await isolation(script.replace(':','-'));
 const began=performance.now();const result=spawnSync('npm',['run',script],{stdio:'inherit'});
 tiers.push({tier:script,seconds:(performance.now()-began)/1000,exitCode:result.status??1});
 mkdirSync('test-results',{recursive:true});
 writeFileSync('test-results/gate.json',JSON.stringify({commit,tiers,wallSeconds:(performance.now()-start)/1000,complete:tiers.length===scripts.length},null,2)+'\n');
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
console.log(`Gate wall time: ${((performance.now()-start)/1000).toFixed(2)}s`);
