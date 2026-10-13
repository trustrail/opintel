import {describe,it,expect} from 'vitest';
import {composeRowDecisions} from '../src/shared/row-decision-composition.js';
import {evaluatePredicate,parsePredicate,predicateHash} from '../src/shared/row-predicate.js';
const column={id:'10000000-0000-4000-8000-000000000001',name:'region',sourceIdentifier:'region',type:'VARCHAR'};
function decision(id:string,level:'object_default'|'pool_override',expression:string){const parsed=parsePredicate(expression,[column]);if(!parsed.ok)throw parsed.error;return {id,level,predicate:parsed.value,columns:[column]};}
const base=decision('20000000-0000-4000-8000-000000000001','object_default',"region = 'EU'");
describe('row decision composition',()=>{
 it('conjoins the default and override rather than replacing the default',()=>{
  const override=decision('20000000-0000-4000-8000-000000000002','pool_override',"region IN ('EU','US')");
  const result=composeRowDecisions([base,override]);expect(result.decisionIds).toEqual([base.id,override.id]);expect(result.predicate).not.toBeNull();
  expect(evaluatePredicate(result.predicate!,[column],{[column.id]:'US'})).toBe(false);
  expect(evaluatePredicate(result.predicate!,[column],{[column.id]:'EU'})).toBe(true);
 });
 it('inherits a default without requiring an override',()=>{const result=composeRowDecisions([base]);expect(result.hash).toBe(predicateHash(base.predicate));expect(result.decisionIds).toEqual([base.id]);});
 it('keeps a missing effective filter explicit for scoped objects',()=>{expect(composeRowDecisions([])).toMatchObject({predicate:null,decisionId:null,decisionIds:[],hash:null});});
});

import {predicateText} from '../src/shared/row-predicate-syntax.js';
it('builder and text round-trip one AST with typed values and explicit grouping',()=>{
 for(const expression of ["region = 'EU' OR (region <> 'US' AND region IS NOT NULL)","NOT (region IN ('O''Brien', 'EU'))"]){const parsed=parsePredicate(expression,[column]);if(!parsed.ok)throw parsed.error;const again=parsePredicate(predicateText(parsed.value,[column]),[column]);expect(again).toEqual(parsed);}
});
