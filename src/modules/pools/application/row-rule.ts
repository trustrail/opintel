import {parsePredicate,referencedColumns,predicateHash,family} from '../../../shared/row-predicate.js';
import type {PredicateColumn} from '../../../shared/row-scope-contract.js';
import type {PoolRowRule} from '../../../shared/api/pool-tables.js';
/** Compile through the existing typed row grammar; never concatenate into agent SQL. */
export function compilePoolRowRule(rule:PoolRowRule,columns:readonly PredicateColumn[]){
 const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
 let expression:string;
 if('allRows'in rule){
  const column=columns.find(c=>family(c.type)!=='unsupported');
  if(!column)return {ok:false as const,reason:'incompatible_type' as const,message:'This table has no supported column for an All rows decision.'};
  expression=`(${quote(column.name)} IS NULL OR ${quote(column.name)} IS NOT NULL)`;
 }else{
  const parts:string[]=[];
  for(const condition of 'conditions'in rule?rule.conditions:[rule]){
   const column=columns.find(c=>c.name===condition.column);
   if(!column)return {ok:false as const,reason:'column_missing' as const,message:`Column “${condition.column}” does not exist in this table.`};
   const value=condition.value,literal=value===null?'NULL':typeof value==='string'?"'"+value.replaceAll("'","''")+"'":typeof value==='boolean'?String(value).toUpperCase():String(value);
   const text=`${quote(column.name)} ${condition.operator} ${literal}`,checked=parsePredicate(text,columns);
   if(!checked.ok)return {ok:false as const,reason:'incompatible_type' as const,message:`Column “${condition.column}”: ${checked.error.message}`};
   parts.push(text);
  }
  expression='combine'in rule?'('+parts.join(rule.combine==='and'?' AND ':' OR ')+')':parts[0]!;
 }
 const parsed=parsePredicate(expression,columns);
 if(!parsed.ok)return {ok:false as const,reason:'incompatible_type' as const,message:parsed.error.message};
 return {ok:true as const,expression,predicate:parsed.value,hash:predicateHash(parsed.value),columns:columns.filter(c=>referencedColumns(parsed.value).includes(c.id))};
}
