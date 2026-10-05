import {z} from 'zod';
import {ElementId,type JsonObject,type Result} from '../../../shared/kernel/index.js';
import type {EvidencePrincipal} from './write.js';

export const joinCandidateColumns=z.object({columns:z.tuple([
 z.object({elementId:z.uuid().transform(ElementId),name:z.string().min(1)}),
 z.object({elementId:z.uuid().transform(ElementId),name:z.string().min(1)}),
])});
/** Only refused dry-run attempts; no query execution or run-writing capability. */
export interface ExplainJoinCandidateWriterPort {
 record(principal:EvidencePrincipal,statement:string,details:JsonObject|undefined,attemptedAt:Date):Promise<Result<void>>;
}
