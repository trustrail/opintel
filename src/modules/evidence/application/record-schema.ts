import { z } from 'zod';
import { errorCodeSchema } from '../../../shared/error-contract.js';
import { DomainError, err, RunId, ProjectId, PoolId, ElementId, Timestamp, type ExposedName, type Result } from '../../../shared/kernel/index.js';
import { QueryRun } from '../domain/query-run.js';

const count=z.number().int().nonnegative().safe();
const time=z.iso.datetime({offset:true}).transform(value=>Timestamp(new Date(value)));
// Historical exposed names are facts, not inputs to today's naming policy.
const name=z.string().min(1).refine(value=>!value.includes('\0')).transform(value=>value as ExposedName);
const object=z.record(z.string(),z.json());
export const versionStampSchema=z.strictObject({policy:count,vocabulary:count,catalog:count,tokenKey:count});
const stage=z.enum(['classify','recover','resolve_values','resolve_sources','compose','validate','qqc_l1','qqc_l2','qqc_l3','execute','record']);
export const runStageSchema=z.strictObject({stage,result:z.enum(['ok','clarify','refuse','warn']),detail:object.nullable(),ms:count});
const element={elementId:z.uuid().transform(ElementId).nullable(),exposedName:name,withheldReason:z.string().nullable()};
export const elementDeliverySchema=z.union([
 z.strictObject({...element,state:z.enum(['withheld','undecided']),treatment:z.null()}),
 z.strictObject({...element,state:z.enum(['released','aggregated']),treatment:z.enum(['clear','tokenized','masked','aggregate_only'])}),
]);
export const runOutcomeSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('answered'),rowCount:count,truncated:z.boolean()}),
 z.strictObject({kind:z.literal('reduced'),rowCount:count,truncated:z.boolean(),withheld:count}),
 z.strictObject({kind:z.literal('refused'),code:errorCodeSchema,element:name.nullable(),stage}),
 z.strictObject({kind:z.literal('clarify'),items:count,resumedAs:z.uuid().transform(RunId).nullable()}),
 z.strictObject({kind:z.literal('failed'),code:errorCodeSchema,retryable:z.boolean()}),
]);
export const runHeaderSchema=z.strictObject({id:z.uuid().transform(RunId),projectId:z.uuid().transform(ProjectId),poolId:z.uuid().transform(PoolId),agentId:z.string().nullable(),keyPrefix:z.string(),mode:z.enum(['query','prompt']),request:z.string(),versions:versionStampSchema,startedAt:time});
export const runCompletionSchema=z.strictObject({outcome:runOutcomeSchema,cil:object.nullable(),sourcePlan:object.nullable(),generatedSql:z.string().nullable(),latencyMs:count.nullable(),freshness:object,synthetic:z.boolean(),completedAt:time});
export const queryRunSchema=z.strictObject({header:runHeaderSchema,stages:z.array(runStageSchema),elements:z.array(elementDeliverySchema),completion:runCompletionSchema.nullable()});
/** Boundary for reconstructing a record; it neither reads nor writes storage. */
export function parseQueryRun(input:unknown):Result<QueryRun> {
 const parsed=queryRunSchema.safeParse(input);
 return parsed.success?QueryRun.create(parsed.data):err(new DomainError('validation_failed','The evidence record does not match its schema.'));
}
