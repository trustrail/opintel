import {z} from 'zod';
export const predicateColumn=z.strictObject({id:z.uuid(),name:z.string().min(1),sourceIdentifier:z.string().min(1),type:z.string().min(1)});
export type PredicateColumn=z.infer<typeof predicateColumn>;
export type Predicate =
 | {kind:'and';terms:Predicate[]}
 | {kind:'or';terms:Predicate[]}
 | {kind:'not';term:Predicate}
 | {kind:'null';column:string;negated:boolean}
 | {kind:'compare';column:string;operator:'='|'<>'|'<'|'<='|'>'|'>=';value:string|null}
 | {kind:'in';column:string;values:(string|null)[]}
 | {kind:'scope';column:string;domain:string};
export const predicate:z.ZodType<Predicate>=z.lazy(()=>z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('and'),terms:z.array(predicate).min(2).max(128)}),
 z.strictObject({kind:z.literal('or'),terms:z.array(predicate).min(2).max(128)}),
 z.strictObject({kind:z.literal('not'),term:predicate}),
 z.strictObject({kind:z.literal('null'),column:z.string(),negated:z.boolean()}),
 z.strictObject({kind:z.literal('compare'),column:z.string(),operator:z.enum(['=','<>','<','<=','>','>=']),value:z.string().nullable()}),
 z.strictObject({kind:z.literal('in'),column:z.string(),values:z.array(z.string().nullable()).min(1).max(1000)}),
 z.strictObject({kind:z.literal('scope'),column:z.string(),domain:z.string()})
]));
export const rowScope=z.strictObject({objectId:z.uuid(),poolId:z.uuid(),decisionId:z.uuid().nullable(),decisionIds:z.array(z.uuid()).optional(),hash:z.string().nullable(),columns:z.array(predicateColumn),predicate:predicate.nullable(),pushdown:z.boolean()});
export type RowScope=z.infer<typeof rowScope>;
/** Per-object rows returned by the governed scan after pushed query predicates.
 * Measured before outer joins/aggregation/limits; null means no scan count.
 * Entitlement scope is resolved through the immutable decision identifiers.
 */
export const rowScopeReceipt=z.strictObject({objectId:z.uuid(),objectName:z.string(),poolId:z.uuid(),decisionId:z.uuid().nullable(),decisionIds:z.array(z.uuid()).optional(),hash:z.string().nullable(),columns:z.array(z.string()),returnedRows:z.number().int().nonnegative().nullable(),provenance:z.literal('agent credential'),missingDecision:z.boolean(),scopeRevisions:z.record(z.string(),z.string()).optional()});
export type RowScopeReceipt=z.infer<typeof rowScopeReceipt>;
