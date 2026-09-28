import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVitest } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';
import { evaluateBypass,findingsSchema,registrySchema,type BypassRun } from './bypass-gate.js';

async function main(){
 if(process.argv.length>2)throw new Error('test:bypass always runs the complete inventory; use the standalone Vitest config for filtered diagnostics.');
 const registry=registrySchema.parse(JSON.parse(await readFile(new URL('../test/bypass/open-attacks.json',import.meta.url),'utf8')));
 const directory=await mkdtemp(join(tmpdir(),'opintel-bypass-gate-'));
 const previousReport=process.env.BYPASS_REPORT;
 process.env.BYPASS_REPORT=join(directory,'findings.json');
 let result:BypassRun|undefined;
 let processTimedOut=false;
 const reporter:Reporter={onProcessTimeout(){processTimedOut=true;},onTestRunEnd(modules,unhandled,reason){
  result={reason,errors:[...unhandled,...modules.flatMap(m=>[...m.errors(),...[...m.children.allSuites()].flatMap(s=>s.errors())])].map(e=>({name:e.name??'Error',message:e.message??''})),
   tests:modules.flatMap(m=>[...m.children.allTests()].map(t=>{const r=t.result();return {file:m.relativeModuleId,name:t.name,state:r.state,errors:(r.errors??[]).map(e=>({name:e.name??'Error',message:e.message??''}))};}))};
 }};
 try{
  const context=await startVitest('test',[],{config:fileURLToPath(new URL('../vitest.bypass.config.ts',import.meta.url)),watch:false,reporters:[reporter]});
  try{
   if(!result)throw new Error('Bypass runner produced no completed result.');
   if(context.state.getUnhandledErrors().length)throw new Error('Bypass runner reported unhandled errors.');
  }finally{await context.close();}
  if(processTimedOut||context.state.getUnhandledErrors().length)throw new Error('Bypass runner failed during shutdown.');
  const findings=findingsSchema.parse(JSON.parse(await readFile(process.env.BYPASS_REPORT,'utf8')));
  const evaluation=evaluateBypass(result,findings,registry);
  if(previousReport)await writeFile(previousReport,JSON.stringify(findings,null,2)+'\n');
  console.log(`Bypass: ${evaluation.passed} passing checks; ${evaluation.queue.length} registered open checks; ${evaluation.regressions.length} regressions.`);
  for(const line of evaluation.queue)console.log(line);
  for(const line of evaluation.regressions)console.error(`REGRESSION ${line}`);
  if(!evaluation.ok){
   // Preserve assertion messages for diagnosing mismatches.
   for(const test of result.tests.filter(t=>t.state==='failed'))console.error(`${test.name}: ${test.errors.map(e=>e.message).join('\n')}`);
  }
  process.exitCode=evaluation.ok?0:1;
 }finally{
  if(previousReport===undefined)delete process.env.BYPASS_REPORT;else process.env.BYPASS_REPORT=previousReport;
  await rm(directory,{recursive:true,force:true});
 }
}
void main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
