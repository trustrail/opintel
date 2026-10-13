import {z} from 'zod';
import {predicate,predicateColumn,type PredicateColumn} from './row-scope-contract.js';
import {normalise,predicateHash,referencedColumns} from './row-predicate.js';
/** Inputs are the current decision at each applicable level, never history. */
export const contributingDecision=z.object({id:z.uuid(),level:z.enum(['tag_rule','object_default','pool_override']),predicate,columns:z.array(predicateColumn)});
export function composeRowDecisions(input:readonly z.infer<typeof contributingDecision>[]){
 const decisions=input.map(d=>contributingDecision.parse(d));
 if(!decisions.length)return {decisionId:null,decisionIds:[],predicate:null,hash:null,columns:[]} as const;
 const combined=normalise(decisions.length===1?decisions[0]!.predicate:{kind:'and',terms:decisions.map(d=>d.predicate)});
 const columns=new Map<string,PredicateColumn>();
 for(const d of decisions)for(const c of d.columns){const previous=columns.get(c.id);if(previous&&previous.type!==c.type)throw new Error('Inconsistent row decision column types.');columns.set(c.id,c);}
 return {decisionId:decisions[0]!.id,decisionIds:decisions.map(d=>d.id),predicate:combined,hash:predicateHash(combined),columns:referencedColumns(combined).map(id=>{const column=columns.get(id);if(!column)throw new Error('Missing row decision column.');return column;})};
}
