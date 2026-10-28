import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {demoTables,generateSpecification,declaredTokenDomain} from '../scripts/demo-soak-definition.js';
import {Coverage} from '../scripts/soak/specification.js';
import {scenarioValuesMatch,expectedReturnedRows,refusalEvidenceMatches} from '../scripts/soak/scenarios.js';
const names=Object.fromEntries(demoTables.map(t=>[t.name,t.schema+'.'+t.schema+'.'+t.name]));
const spec=generateSpecification(names);
const scenario=(name:string,pool=0)=>spec.scenarios.find(s=>s.id===`pool${pool}/semantics/${name}`)!;
it.each([0,1])('J-029: masked grouping and distinct merge collisions before the operation, pool %s',pool=>{
 const group=scenario('masked-group',pool),distinct=scenario('masked-distinct',pool);
 expect(group.expected.resultRows).toEqual([['••••1111',3],['••••2222',1],[null,1]]);
 expect(distinct.expected.resultRows).toEqual([['••••1111'],['••••2222'],[null]]);
 expect(scenarioValuesMatch(group,spec,[{name:'masked_value'},{name:'n'}],[[null,1],['••••2222',1],['••••1111',3]])).toBe(true);
 // Late masking would yield duplicate masked groups for AA-1111 and BB-1111.
 expect(scenarioValuesMatch(group,spec,[{name:'masked_value'},{name:'n'}],[['••••1111',2],['••••1111',1],['••••2222',1],[null,1]])).toBe(false);
 expect(scenarioValuesMatch(distinct,spec,[{name:'masked_value'}],[['••••1111'],['••••1111'],['••••2222'],[null]])).toBe(false);
 expect(scenarioValuesMatch(distinct,spec,[{name:'masked_value'}],[['••••1111'],['••••2222'],[null]])).toBe(true);
 const object=spec.objects.find(o=>o.name===group.objects[0]&&o.poolIndex===pool)!;
 expect(expectedReturnedRows(object,group)).toBe(5);
 expect(expectedReturnedRows(object,distinct)).toBe(5);
});
it('A1: shared token domains compare equal and isolated elements differ, including duplicates and null',()=>{
 expect(declaredTokenDomain('shared_key')).toBe('soakshared');expect(declaredTokenDomain('isolated_key')).toBeNull();
 const s=scenario('token-domains'),columns=s.columns.map(c=>({name:c.alias}));
 const token=(domain:string,char:string)=>'v1_'+domain+'_'+char.repeat(26);
 const rows=s.expected.rows!.map(r=>[r.case_id,r.a_shared_key===null?null:token('soakshared','A'),r.a_isolated_key===null?null:token('isolatedleft','B'),r.b_shared_key===null?null:token('soakshared','A'),r.b_isolated_key===null?null:token('isolatedright','C')]);
 expect(scenarioValuesMatch(s,spec,columns,rows)).toBe(true);
 const badShared=structuredClone(rows);badShared[0]![3]=token('soakshared','D');expect(scenarioValuesMatch(s,spec,columns,badShared)).toBe(false);
 const badIsolated=structuredClone(rows);badIsolated[0]![4]=badIsolated[0]![2];expect(scenarioValuesMatch(s,spec,columns,badIsolated)).toBe(false);
 const missing=rows.slice(1);expect(scenarioValuesMatch(s,spec,columns,missing)).toBe(false);
});
it('B4a: UNION requires sql_not_permitted and its refusal evidence; a different refusal cannot pass',()=>{
 const s=scenario('union'),id=randomUUID(),coverage=new Coverage([s]);
 expect(coverage.observe(s,{outcome:'sql_not_permitted'})).toBe(true);
 expect(coverage.observe(s,{outcome:'unsupported_on_token'})).toBe(false);
 expect(refusalEvidenceMatches(s,id,{refusalCode:'sql_not_permitted',stages:[{result:'refuse',code:'sql_not_permitted'}]})).toBe(true);
 expect(refusalEvidenceMatches(s,id,{refusalCode:'sql_not_permitted',stages:[]})).toBe(false);
 expect(refusalEvidenceMatches(s,id,{refusalCode:'unsupported_on_token',stages:[{result:'refuse',code:'unsupported_on_token'}]})).toBe(false);
});
it('5.24a: an unsatisfiable token join requires its own persisted Suggestions candidate',()=>{
 const s=scenario('isolated-join'),id=randomUUID(),coverage=new Coverage([s]);
 expect(coverage.observe(s,{outcome:'unsupported_on_token'})).toBe(false);
 expect(coverage.observe(s,{outcome:'unsupported_on_token',cause:'unsatisfiable_token_join'})).toBe(true);
 const detail={refusalCode:'unsupported_on_token',stages:[{result:'refuse',code:'unsupported_on_token'}],metadata:{refusal:{candidate:{id,columns:s.objects.map(name=>({elementId:randomUUID(),name:name+'.isolated_key'}))}}}};
 expect(refusalEvidenceMatches(s,id,detail)).toBe(true);
 expect(refusalEvidenceMatches(s,randomUUID(),detail)).toBe(false); // An explain candidate is not this query candidate.
 expect(refusalEvidenceMatches(s,id,{...detail,metadata:{refusal:{candidate:null}}})).toBe(false);
 detail.metadata.refusal.candidate.columns[0]!.name='unrelated.column';expect(refusalEvidenceMatches(s,id,detail)).toBe(false);
});
