import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseQueryRun } from '../src/modules/evidence/index.js';
const record=()=>({header:{id:randomUUID(),projectId:randomUUID(),poolId:randomUUID(),agentId:null,keyPrefix:'opk_live_prefix',mode:'query',request:'SELECT 1',versions:{policy:7,vocabulary:2,catalog:3,tokenKey:4},startedAt:'2026-09-01T00:00:00Z'},elements:[],stages:[],completion:null});
it('an incomplete snapshot is immutable and holds its own captured policy stamp',()=>{
 const input=record(),parsed=parseQueryRun(input);expect(parsed.ok).toBe(true);if(!parsed.ok)throw parsed.error;
 input.header.versions.policy=99;
 expect(parsed.value.status).toBe('incomplete');expect(parsed.value.versions.policy).toBe(7);
 expect(Reflect.set(parsed.value.versions,'policy',99)).toBe(false);
 expect(parsed.value.versions.policy).toBe(7);
 expect(Object.isFrozen(parsed.value.state.stages)).toBe(true);
});
it('preserves the full terminal outcome without inventing a completion',()=>{
 for(const outcome of [{kind:'answered',rowCount:1,truncated:false},{kind:'reduced',rowCount:0,truncated:true,withheld:2},{kind:'clarify',items:2,resumedAs:null},{kind:'failed',code:'source_unavailable',retryable:true},{kind:'refused',code:'element_withheld',element:'field',stage:'validate'}]) {
  const input={...record(),stages:outcome.kind==='refused'?[{stage:'validate',result:'refuse',detail:{reason:'withheld'},ms:1}]:[],completion:{outcome,cil:null,sourcePlan:null,generatedSql:null,latencyMs:1,freshness:{},synthetic:false,completedAt:'2026-09-01T00:00:01Z'}};
  const parsed=parseQueryRun(input);expect(parsed.ok).toBe(true);if(!parsed.ok)throw parsed.error;
  expect(parsed.value.status).toBe('complete');expect(parsed.value.outcome).toEqual(outcome);
  expect(Object.isFrozen(parsed.value.state.completion?.outcome)).toBe(true);
 }
});
it('refuses a refusal without its refusing stage and completion before the header',()=>{
 const input={...record(),completion:{outcome:{kind:'refused',code:'element_withheld',element:'field',stage:'validate'},cil:null,sourcePlan:null,generatedSql:null,latencyMs:1,freshness:{},synthetic:false,completedAt:'2026-09-01T00:00:01Z'}};
 expect(parseQueryRun(input)).toMatchObject({ok:false});
 expect(parseQueryRun({...input,completion:{...input.completion,outcome:{kind:'answered',rowCount:0,truncated:false},completedAt:'2026-08-31T23:59:59Z'}})).toMatchObject({ok:false});
});
it('rejects a sentinel treatment, mismatched null treatment and missing policy version',()=>{
 for(const [state,treatment] of [['withheld','withheld'],['withheld','clear'],['undecided','masked'],['released',null],['aggregated',null]])expect(parseQueryRun({...record(),elements:[{elementId:null,exposedName:'field',state,treatment,withheldReason:null}]})).toMatchObject({ok:false});
 const input=record();expect(parseQueryRun({...input,header:{...input.header,versions:{vocabulary:2,catalog:3,tokenKey:4}}})).toMatchObject({ok:false});
});
