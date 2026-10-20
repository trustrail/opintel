import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {rowScopeReceipt} from '../src/shared/row-scope-contract.js';
import {generateSpecification,demoTables} from '../scripts/demo-soak-definition.js';
import {expectedReturnedRows} from '../scripts/soak/scenarios.js';
const names=Object.fromEntries(demoTables.map(t=>[t.name,t.schema+'.'+t.schema+'.'+t.name]));
const spec=generateSpecification(names);
it('E09-001: current receipt boundaries accept returnedRows and reject the misleading legacy wire field',()=>{
 const identity={objectId:randomUUID(),objectName:'records',poolId:randomUUID(),decisionId:randomUUID(),hash:'a'.repeat(64),columns:['id'],provenance:'agent credential',missingDecision:false};
 expect(rowScopeReceipt.parse({...identity,returnedRows:1})).toEqual({...identity,returnedRows:1});
 expect(rowScopeReceipt.safeParse({...identity,entitledRows:1}).success).toBe(false);
 expect(rowScopeReceipt.safeParse({...identity,returnedRows:1,entitledRows:5}).success).toBe(false);
});
it('E09-002: every declared equality uses the query expected count rather than the whole eligible set',()=>{
 for(const scenario of spec.scenarios.filter(s=>s.kind==='declared shape')){
  const object=spec.objects.find(o=>o.name===scenario.objects[0]&&o.poolIndex===scenario.poolIndex)!;
  expect(object.expectedRowCount).toBeGreaterThan(1);
  const id=/WHERE recovery_id = '([^']+)'/u.exec(scenario.sql)![1];
  expect(expectedReturnedRows(object,scenario)).toBe(object.rows.filter(r=>r.recovery_id===id).length);
  expect(expectedReturnedRows(object,scenario)).toBe(1);
 }
});
it('E09-003: a non-pushed IS NOT NULL predicate does not replace its input scan count',()=>{
 const object=spec.objects.find(o=>o.poolIndex===0&&o.name===names.recoveries)!;
 expect(object.rows.filter(r=>r.shape_value!==null).length).toBeLessThan(object.expectedRowCount);
 expect(expectedReturnedRows(object)).toBe(object.expectedRowCount);
});
it('E09-004: joins and aggregates retain input scan counts instead of borrowing final answer counts',()=>{
 const join=spec.scenarios.find(s=>s.id.includes('policies-unmatched'))!;
 expect(join.expected.rowCount).toBe(0);
 for(const name of join.objects){const object=spec.objects.find(o=>o.poolIndex===join.poolIndex&&o.name===name)!;expect(expectedReturnedRows(object,join)).toBe(object.rows.length);expect(object.rows.length).toBeGreaterThan(0);}
 const aggregate=spec.scenarios.find(s=>s.kind==='declared aggregate')!,object=spec.objects.find(o=>o.poolIndex===aggregate.poolIndex&&o.name===aggregate.objects[0])!;
 expect(aggregate.expected.rowCount).toBe(1);expect(expectedReturnedRows(object,aggregate)).toBe(object.rows.length);
 const missing=spec.objects.find(o=>o.rowMode==='missing')!;expect(expectedReturnedRows(missing)).toBe(0);
});
