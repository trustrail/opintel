import { describe,expect,it } from 'vitest';
import { evaluateBypass,type Registry,type BypassRun,type Finding } from '../scripts/bypass-gate.js';

function fixture(){
 const file='test/bypass/attacks.test.ts';
 const observation:Finding={id:'J-035',variant:'singleton',status:'ATTACK_SUCCEEDED',detail:'101'};
 const errors=[{name:'AssertionError',message:'attack returned rows'}];
 const registry:Registry={requiredTests:[{file,name:'J-015 COPY'},{file,name:'J-035 singleton'}],open:[{
  file,name:'J-035 singleton',owner:'S2d',reason:'Cardinality enforcement',errors,findings:[observation],
 }]};
 const run:BypassRun={reason:'failed',errors:[],tests:[{file,name:'J-015 COPY',state:'passed',errors:[]},{file,name:'J-035 singleton',state:'failed',errors}]};
 return {run,registry,findings:[observation]};
}
describe('bypass expected-failure regression gate',()=>{
 it('accepts only the registered failure and prints its owner',()=>{
  const f=fixture(),result=evaluateBypass(f.run,f.findings,f.registry);
  expect(result.ok).toBe(true);expect(result.queue).toEqual(['OPEN [S2d] J-035 singleton — Cardinality enforcement']);expect(result.passed).toBe(1);
 });
 it('a previously blocked attack succeeding fails the build',()=>{
  const f=fixture();f.run.tests[0]!.state='failed';f.run.tests[0]!.errors=[{name:'AssertionError',message:'attack returned rows'}];
  f.findings.push({id:'J-015',variant:'COPY',status:'ATTACK_SUCCEEDED',detail:'wrote file'});
  const result=evaluateBypass(f.run,f.findings,f.registry);
  expect(result.ok).toBe(false);expect(result.regressions.some(s=>s.includes('New failure'))).toBe(true);
  expect(result.regressions.some(s=>s.includes('New unsafe outcome: J-015'))).toBe(true);
 });
 it('a new success observation still fails if its test accidentally stops asserting refusal',()=>{
  const f=fixture();f.findings.push({id:'J-015',variant:'COPY',status:'ATTACK_SUCCEEDED',detail:'wrote file'});
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
 it('an unrelated timeout in a registered attack is not an expected failure',()=>{
  const f=fixture();f.run.tests[1]!.errors=[{name:'Error',message:'Test timed out'}];
  expect(evaluateBypass(f.run,f.findings,f.registry).regressions).toContain('Changed failure: test/bypass/attacks.test.ts :: J-035 singleton');
 });
 it('identical assertion text with different leaked data fails',()=>{
  const f=fixture();f.findings=[{...f.findings[0]!,detail:'101 and secret'}];
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
 it('a fixed attack cannot silently retain its exemption',()=>{
  const f=fixture();f.run.tests[1]={...f.run.tests[1]!,state:'passed',errors:[]};f.findings=[];
  const result=evaluateBypass(f.run,f.findings,f.registry);
  expect(result.ok).toBe(false);expect(result.regressions.join()).toContain('Remove it with its S2d fix');
  f.registry.open=[];f.run.reason='passed';expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(true);
 });
 it('an owner landing removes the exemption; unfixed assertions then fail normally',()=>{
  const f=fixture();f.registry.open=[];
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
 for(const state of ['skipped','pending'] as const)it(`${state} is always a failure, including for known open attacks`,()=>{
  const f=fixture();f.run.tests[1]!.state=state;
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
 it('deleting a required passing test fails',()=>{
  const f=fixture();f.run.tests.shift();
  expect(evaluateBypass(f.run,f.findings,f.registry).regressions.join()).toContain('Missing required attack/control');
 });
 it('duplicate tests and duplicated evidence cannot satisfy the registry',()=>{
  const f=fixture();f.run.tests.push(f.run.tests[1]!);f.findings.push(f.findings[0]!);
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
 it('hook errors, unhandled errors and interrupted runs are never exempt',()=>{
  const f=fixture();f.run.errors=[{name:'Error',message:'beforeAll failed'}];
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
  f.run.errors=[];f.run.reason='interrupted';expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
 it('another raw error fails even when the registered final-sweep assertion text matches',()=>{
  const f=fixture();f.findings.push({id:'J-016',variant:'reader',status:'REFUSED_RAW',detail:'unexpected permission error'});
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
 it('only the known OOM family normalizes allocator-specific sizes',()=>{
  const f=fixture(),expected={id:'J-020',variant:'memory pressure',status:'REFUSED_RAW',detail:'Out of Memory Error'};
  f.registry.open[0]!.findings.push(expected);
  f.findings.push({...expected,detail:'Out of Memory Error: failed to allocate 8 MiB'});
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(true);
  f.findings[1]!.detail='Permission Error: file missing';
  expect(evaluateBypass(f.run,f.findings,f.registry).ok).toBe(false);
 });
});
