import { z } from 'zod';
import { DomainError } from '../../../src/shared/kernel/index.js';
import * as syntax from './syntax.js';
import type { TreatmentInspection } from './treatments.js';
export type Aggregate=NonNullable<TreatmentInspection['aggregate']>;
export function aggregateRefusal(aggregate:Aggregate,stage:1|2,invalid=false):DomainError{
 return new DomainError('unsupported_on_aggregate_only',`Element ${aggregate.name} is aggregate-only. Minimum group size ${aggregate.threshold} was not met at stage ${stage}. Use a broader group or less restrictive filter, or ask an administrator to review the threshold.`,{
  cause:invalid?'cardinality_count_invalid':stage===1?'cardinality_estimate_low':'cardinality_count_low',name:aggregate.name,elementId:aggregate.elementId,aggregateMinGroupSize:aggregate.threshold,stage,construct:aggregate.name,
  proofCategory:stage===2?'aggregate_stage2':'sql_not_permitted',
 });
}
export function withGroupCount(tree:unknown,columnNames:readonly string[],contributors:Aggregate['contributors']):unknown{
 const doc=syntax.document.parse(structuredClone(tree));
 const q=syntax.select.parse(doc.statements[0]!.node);
 const names=new Set(columnNames.map(n=>n.toLowerCase()));
 const collect=(value:unknown):void=>{if(typeof value==='string')names.add(value.toLowerCase());else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect);};
 collect(tree);let alias='__group_size';while(names.has(alias)||contributors.some((_,i)=>names.has(alias+i)))alias+='_';
 for(const [i,contributor] of contributors.entries()){
 const count={class:'FUNCTION',type:'FUNCTION',alias:alias+i,query_location:0,
  function_name:'count',schema:'',catalog:'',children:[{class:'CASE',type:'CASE_EXPR',alias:'',query_location:0,case_checks:[{when_expr:{class:'OPERATOR',type:'OPERATOR_IS_NOT_NULL',alias:'',query_location:0,children:[{class:'COLUMN_REF',type:'COLUMN_REF',alias:'',query_location:0,column_names:contributor.value}]},then_expr:{class:'COLUMN_REF',type:'COLUMN_REF',alias:'',query_location:0,column_names:contributor.key}}],else_expr:{class:'CONSTANT',type:'VALUE_CONSTANT',alias:'',query_location:0,value:{type:{id:'NULL',type_info:null},is_null:true}}}],filter:null,
  order_bys:{type:'ORDER_MODIFIER',orders:[]},distinct:true,is_operator:false,export_state:false};
 q.select_list.push(count);
 }
 doc.statements[0]!.node=q;
 return doc;
}
export function validGroupCount(value:unknown,threshold:number):boolean{
 const parsed=z.union([z.string().regex(/^\d+$/u),z.number().int().nonnegative()]).safeParse(value);
 return parsed.success&&BigInt(parsed.data)>=BigInt(threshold);
}
