import {afterEach,expect,it,vi} from 'vitest';
import type {FullResult,TestCase,TestResult} from '@playwright/test/reporter';
import {writeFileSync} from 'node:fs';
import Reporter from '../e2e/conformance/reporter.js';
import {screenPaths} from '../e2e/conformance/screens.js';

vi.mock('node:fs',async importOriginal=>({
 ...await importOriginal<typeof import('node:fs')>(),
 mkdirSync:vi.fn(),writeFileSync:vi.fn(),
}));
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
const result={status:'passed'} as FullResult;
function observe(reporter:Reporter,paths:string[],findings:unknown[]=[]){
 reporter.onTestEnd({title:'scenario'} as TestCase,{
  status:'passed',errors:[],attachments:[{name:'control-conformance',body:Buffer.from(JSON.stringify({
   scans:paths.map(screen=>({screen:screen.replaceAll('$projectId','project'),heading:'Screen',controls:1,states:['ready']})),findings,
  }))}],
 } as TestResult);
}
function artifact(){
 const body=vi.mocked(writeFileSync).mock.calls.at(-1)?.[1];
 return JSON.parse(String(body)) as {status:string;scope:string;coverageComplete:boolean;missing:unknown[]};
}
it('focused coverage reports incompleteness without claiming the full gate passed',async()=>{
 vi.stubEnv('OPINTEL_CONFORMANCE_COVERAGE','partial');
 const reporter=new Reporter();observe(reporter,['/projects']);
 expect(await reporter.onEnd(result)).toBeUndefined();
 expect(artifact()).toMatchObject({scope:'partial',coverageComplete:false,status:'passed'});
 expect(artifact().missing.length).toBeGreaterThan(0);
});
it('full coverage still fails for unvisited routes',async()=>{
 const reporter=new Reporter();observe(reporter,['/projects']);
 expect(await reporter.onEnd(result)).toEqual({status:'failed'});
 expect(artifact()).toMatchObject({scope:'full',status:'failed',coverageComplete:false});
});
it('a focused control finding still fails',async()=>{
 vi.stubEnv('OPINTEL_CONFORMANCE_COVERAGE','partial');
 const reporter=new Reporter();observe(reporter,['/projects'],[{screen:'/projects',name:'button',markup:'<button>',reason:'Unclassified control'}]);
 expect(await reporter.onEnd(result)).toEqual({status:'failed'});
 expect(artifact().status).toBe('failed');
});
it('the full gate requires every route derived from the application',async()=>{
 const reporter=new Reporter();observe(reporter,screenPaths());
 expect(screenPaths()).toHaveLength(53);
 expect(await reporter.onEnd(result)).toBeUndefined();
 expect(artifact()).toMatchObject({scope:'full',coverageComplete:true,missing:[]});
});
