import {parsePredicate,referencedColumns,predicateHash,family} from '../../../shared/row-predicate.js';
import type {PredicateColumn} from '../../../shared/row-scope-contract.js';
import type {PoolRowRule} from '../../../shared/api/pool-tables.js';
/** Compile through the existing typed row grammar; never concatenate into agent SQL. */
export function compilePoolRowRule(rule:PoolRowRule,columns:readonly PredicateColumn[]){
 const all='allRows'in rule;
 const column=all?columns.find(c=>family(c.type)!=='unsupported'):columns.find(c=>c.name===rule.column);
 if(!column)return {ok:false as const,reason:all?'incompatible_type' as const:'column_missing' as const};
 const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
 const expression=all?`(${quote(column.name)} IS NULL OR ${quote(column.name)} IS NOT NULL)`:
  `${quote(column.name)} ${rule.operator} ${rule.value===null?'NULL':typeof rule.value==='string'?"'"+rule.value.replaceAll("'","''")+"'":typeof rule.value==='boolean'?String(rule.value).toUpperCase():String(rule.value)}`;
 const parsed=parsePredicate(expression,columns);
 if(!parsed.ok)return {ok:false as const,reason:'incompatible_type' as const};
 return {ok:true as const,expression,predicate:parsed.value,hash:predicateHash(parsed.value),columns:columns.filter(c=>referencedColumns(parsed.value).includes(c.id))};
}
