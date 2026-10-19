import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateSpecification,demoTables} from '../demo-soak-definition.js';
import {Coverage} from './specification.js';
import {scenarioValuesMatch,discoveryMismatches} from './scenarios.js';
const names=Object.fromEntries(demoTables.map(t=>[t.name,t.schema+'.'+t.schema+'.'+t.name]));
const spec=generateSpecification(names);
test('seeder declares seven decisions, unfiltered and missing scopes, and disjoint and three-source joins',()=>{
 assert.deepEqual([...new Set(spec.objects.flatMap(o=>o.columns.map(c=>c.treatment)))].sort(),['aggregate_only','clear','custody','masked','tokenized','undecided','withheld']);
 assert.equal(spec.objects.filter(o=>o.rowMode==='unfiltered').length,2);
 for(const o of spec.objects.filter(o=>o.rowMode==='unfiltered'))assert.equal(o.expectedRowCount,3);
 for(const s of spec.scenarios.filter(s=>s.id.includes('policies-unmatched')))assert.equal(s.expected.rowCount,0);
 assert.equal(spec.scenarios.filter(s=>s.id.includes('policies-claims-recoveries')).length,2);
 assert.equal(spec.objects.find(o=>o.poolIndex===0&&o.name===names.recoveries)!.columns.find(c=>c.name==='pool_only')!.treatment,'clear');
 assert.equal(spec.objects.find(o=>o.poolIndex===1&&o.name===names.recoveries)!.columns.find(c=>c.name==='pool_only')!.outcome,'entitlement_missing');
 assert.equal(new Set(spec.scenarios.map(s=>s.id)).size,spec.scenarios.length);
});
test('unhit scenarios are not passes; wrong refusal and wrong row count fail',()=>{
 const c=new Coverage(spec.scenarios);assert.equal(c.summary().exercised,0);assert.equal(c.summary().unhit.length,spec.scenarios.length);
 const s=spec.scenarios.find(s=>s.id.includes('policies-unmatched'))!;
 assert.equal(c.observe(s,{outcome:'success',rowCount:0}),true);
 assert.equal(c.observe(s,{outcome:'success',rowCount:1}),false);
 assert.equal(c.observe(s,{outcome:'dependency_unavailable'}),false);
 assert.equal(c.summary().scenarios.find(x=>x.id===s.id)!.status,'FAIL');
});
test('edge values are literal expectations, including null, empty, Unicode, long and token-looking clear text',()=>{
 const s=spec.scenarios.find(s=>s.id==='pool0/shape/token-looking literal')!;
 const r=s.expected.rows![0]!;const token='v1_policy_'+'A'.repeat(26);const rows=[[r.recovery_id,token,r.insured_name===null?null:'••••'+Array.from(String(r.insured_name)).slice(-4).join(''),r.shape_value]];
 // This row has a Unicode masked value longer than four code points.
 const chars=Array.from(String(r.insured_name));rows[0]![2]=r.insured_name===null?null:chars.length<=4?'****':'••••'+chars.slice(-4).join('');
 assert.equal(scenarioValuesMatch(s,spec,s.columns.map(c=>({name:c.alias})),rows),true);
 rows[0]![3]='different';assert.equal(scenarioValuesMatch(s,spec,s.columns.map(c=>({name:c.alias})),rows),false);
 assert.ok(spec.scenarios.some(s=>s.id==='pool0/shape/long'));
 assert.ok(spec.scenarios.some(s=>s.id==='pool0/shape/duplicate'));
 assert.ok(discoveryMismatches(spec,0,[]).length>0);
});
test('custody expectations distinguish seeded associations per credential without learning from responses',()=>{
 const agents=Array.from({length:10},(_,i)=>({credentialId:'agent-'+i,poolIndex:i%2,...i===1?{}:{association:{}}}));
 const s=generateSpecification(names,agents);assert.equal(s.scenarios.length,85);
 const unavailable=s.scenarios.filter(s=>s.credentialId==='agent-1');assert.equal(unavailable.length,2);
 for(const c of unavailable)assert.deepEqual(c.expected,{outcome:'dependency_unavailable',reason:'certificate_association_missing'});
 const rows=s.objects.filter(o=>o.name===names.recoveries).map(o=>o.expectedRowCount);assert.deepEqual(rows,[7,5]);
 assert.deepEqual(s.scenarios.filter(s=>s.id.includes('policies-claims-recoveries')).map(s=>s.expected.rowCount),[4,3]);
});
