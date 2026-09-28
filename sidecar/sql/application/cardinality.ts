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
/** A group average cannot support a disclosure decision. The native estimator
 * is consulted only for one unfiltered base-table group. Every richer shape is
 * uncertain until an estimator that describes its individual groups exists. */
export function supportsEstimate(tree:unknown):boolean{
 const doc=syntax.document.parse(tree),q=syntax.select.safeParse(doc.statements[0]!.node);
 return q.success&&q.data.cte_map.map.length===0&&q.data.group_expressions.length===0&&q.data.group_sets.length===0
  &&q.data.where_clause===null&&syntax.baseTable.safeParse(q.data.from_table).success;
}
export function withGroupCount(tree:unknown,columnNames:readonly string[]):unknown{
 const doc=syntax.document.parse(structuredClone(tree));
 const q=syntax.select.parse(doc.statements[0]!.node);
 const names=new Set(columnNames.map(n=>n.toLowerCase()));
 const collect=(value:unknown):void=>{if(typeof value==='string')names.add(value.toLowerCase());else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect);};
 collect(tree);let alias='__group_size';while(names.has(alias))alias+='_';
 const count={class:'FUNCTION',type:'FUNCTION',alias,query_location:0,
  function_name:'count_star',schema:'',catalog:'',children:[],filter:null,
  order_bys:{type:'ORDER_MODIFIER',orders:[]},distinct:false,is_operator:false,export_state:false};
 q.select_list.push(count);doc.statements[0]!.node=q;
 return doc;
}
export function validGroupCount(value:unknown,threshold:number):boolean{
 const parsed=z.union([z.string().regex(/^\d+$/u),z.number().int().nonnegative()]).safeParse(value);
 return parsed.success&&BigInt(parsed.data)>=BigInt(threshold);
}
