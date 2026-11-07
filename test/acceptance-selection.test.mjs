import {it,expect} from 'vitest';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acceptanceSelection} from '../scripts/images/acceptance-selection.mjs';
import {preflightWithWarmup} from '../scripts/preflight-retry.mjs';
import {runLedger} from '../scripts/run-ledger.mjs';
it('selected custody/companion and soak continuations require the original live install',()=>{
 expect(()=>acceptanceSelection(['--only','custody,companion'])).toThrow(/reuse-run/u);
 expect(acceptanceSelection(['--only','custody,companion','--reuse-run','tmp/live'])).toMatchObject({custody:true,soak:false,latency:false,xq:false,browser:false});
 expect(acceptanceSelection(['--from','soak','--reuse-run','tmp/live','--candidate'])).toMatchObject({custody:false,soak:true,latency:true,remaining:['--candidate']});
 expect(()=>acceptanceSelection(['--only','custody','--from','soak','--reuse-run','tmp/live'])).toThrow();
 expect(acceptanceSelection(['--baseline'])).toMatchObject({baseline:true,custody:false,xq:false,browser:false,soak:true,latency:true});
});
it('preflight retries exactly once after warm-up, retaining both durations',async()=>{
 const order=[],samples=[];let attempts=0,clock=0;
 const result=await preflightWithWarmup(async()=>{order.push('check');clock+=25;if(++attempts===1)throw new Error('cold');return 'ready';},{warmup:async()=>{order.push('warmup');},record:sample=>samples.push(sample),now:()=>clock});
 expect(result).toBe('ready');expect(order).toEqual(['check','warmup','check']);expect(samples.map(s=>[s.result,s.durationMs])).toEqual([['failed',25],['passed',25]]);
 let called=0;await expect(preflightWithWarmup(async()=>{called++;throw new Error('still cold');},{warmup:async()=>{}})).rejects.toThrow('still cold');expect(called).toBe(2);
});
it('ledger excludes preflight, enforces separate full and baseline budgets and records image identities',()=>{
 const directory=mkdtempSync(join(tmpdir(),'ledger-'));try{const ledger=runLedger(join(directory,'ledger.json'));ledger.preflight({level:'L1',commit:'test',result:'failed',durationMs:1000});const run=ledger.start({level:'L1',stage:'normal',commit:'test',images:['sha256:fixture']});run.finish('failed');expect(()=>ledger.start({level:'L1',stage:'retry',commit:'test'})).toThrow(/budget exhausted/u);for(const budget of ['L2:full','L2:baseline'])ledger.start({level:'L2',budget,stage:'soak',commit:'test'}).finish('passed');const entries=ledger.snapshot().entries;expect(entries[0].charged).toBe(false);expect(entries[1]).toMatchObject({images:['sha256:fixture'],executed:1,allowed:1,result:'failed'});}finally{rmSync(directory,{recursive:true,force:true});}
});
it('full acceptance still checks soak and custody before benchmarking; partial paths never reinstall silently',()=>{
 const driver=readFileSync('scripts/images/stage5-smoke.mjs','utf8');expect(driver).toContain("if(!checkpoint){");expect(driver).toContain('Retained install daemon is not running; do not recreate it silently.');expect(driver).toContain('Reuse requires the same pinned images and archives.');expect(driver).toContain("assert.equal(await childDone,0,'Customer demo soak failed')");expect(driver).toContain('!existingRuns.has(name)');
 const benchmark=readFileSync('scripts/images/installed-transport-benchmark.mjs','utf8');expect(benchmark).toContain('index<50');expect(benchmark).toContain("'query'");expect(benchmark).toContain('reinsurance_claims.soak_claims.claims');
});
