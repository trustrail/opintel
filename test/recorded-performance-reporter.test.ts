import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {it,expect} from 'vitest';
import {repositoryRoot} from '../scripts/dev-environment.js';

const require=createRequire(import.meta.url);
it('recorded deadlines stay non-gating beside real failures, without rewriting their results',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'recorded-deadline-'));
 try{
  const reporter=join(repositoryRoot,'e2e/recorded-performance-reporter.ts');
  await writeFile(join(directory,'playwright.config.ts'),`export default {testDir:'.',testMatch:'case.spec.ts',workers:1,retries:0,reporter:[[${JSON.stringify(reporter)}],['json',{outputFile:'report.json'}]]};`);
  await writeFile(join(directory,'case.spec.ts'),`import {test,expect} from ${JSON.stringify(require.resolve('@playwright/test'))};
test('G-019: deadline',async()=>{test.setTimeout(100);await new Promise(()=>{});});
test('ordinary assertion',async()=>{expect(1).toBe(2);});
test('G-019: assertion',async()=>{expect(1).toBe(2);});
test('ordinary deadline',async()=>{test.setTimeout(100);await new Promise(()=>{});});
`);
  const run=(grep?:string)=>spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config',join(directory,'playwright.config.ts'),...(grep?['--grep',grep]:[])],{cwd:directory,encoding:'utf8',timeout:20_000});
  const mixed=run();expect(mixed.error).toBeUndefined();expect(mixed.status,mixed.stderr).toBe(1);
  const report=JSON.parse(await readFile(join(directory,'report.json'),'utf8')) as {stats:{expected:number;unexpected:number};suites:{specs:{title:string;tests:{expectedStatus:string;results:{status:string}[]}[]}[]}[]};
  expect(report.stats).toMatchObject({expected:1,unexpected:3});
  const specs=report.suites.flatMap(s=>s.specs);
  expect(specs.find(s=>s.title==='G-019: deadline')?.tests[0]).toMatchObject({expectedStatus:'timedOut',results:[{status:'timedOut'}]});
  for(const title of ['ordinary assertion','G-019: assertion'])expect(specs.find(s=>s.title===title)?.tests[0]).toMatchObject({expectedStatus:'passed',results:[{status:'failed'}]});
  expect(specs.find(s=>s.title==='ordinary deadline')?.tests[0]).toMatchObject({expectedStatus:'passed',results:[{status:'timedOut'}]});
  const deadlines=JSON.parse(await readFile(join(directory,'test-results/recorded-performance-deadlines.json'),'utf8')) as {deadlines:{title:string}[]};
  expect(deadlines.deadlines.map(d=>d.title)).toEqual(['G-019: deadline']);
  const alone=run('G-019: deadline');expect(alone.error).toBeUndefined();expect(alone.status,alone.stderr).toBe(0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
