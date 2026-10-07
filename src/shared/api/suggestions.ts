import {z} from 'zod';
import {BulkEntitlementBody} from './bulk-entitlements.js';
import {declaredTokenDomain} from '../token-domain.js';
export const SuggestionColumn=z.object({id:z.uuid(),name:z.string(),active:z.boolean(),
 address:z.object({sourceId:z.uuid(),sourceName:z.string(),alias:z.string(),schema:z.string(),object:z.string(),column:z.string().nullable()}),exposedType:z.string().nullable(),
 treatments:z.array(z.object({poolId:z.uuid(),poolName:z.string(),treatment:BulkEntitlementBody.shape.treatment.nullable()})),
 domain:z.object({declared:z.string().nullable(),effective:z.string(),provenance:z.enum(['declared','element_identity']),memberCount:z.number().int().nonnegative()})});
export const AttemptDay=z.object({day:z.iso.date(),queries:z.number().int().nonnegative(),explains:z.number().int().nonnegative()});
export const SuggestionDecision=z.object({id:z.uuid(),action:z.enum(['confirm','reject','not_sure']),actorId:z.uuid(),actorName:z.string(),at:z.string(),domain:z.string().nullable(),assignments:z.array(z.object({elementId:z.uuid(),version:z.number().int().positive()}))});
export const Suggestion=z.object({id:z.uuid(),left:SuggestionColumn,right:SuggestionColumn,queries:z.number().int().nonnegative(),explains:z.number().int().nonnegative(),latestAt:z.string(),trend:z.array(AttemptDay).length(7),latestAttemptId:z.uuid(),agents:z.array(z.string()),pools:z.array(z.object({id:z.uuid(),name:z.string()})),confirmationBlocked:z.string().nullable(),status:z.enum(['pending','not_sure','confirm','reject']),raisedAgain:z.boolean(),history:z.array(SuggestionDecision)});
export const SuggestionPage=z.object({items:z.array(Suggestion),nextCursor:z.string().nullable(),projectName:z.string()});
export const DomainOption=z.object({domain:z.string(),members:z.array(z.object({elementId:z.uuid(),name:z.string(),objectLabel:z.string(),columnName:z.string().nullable(),version:z.number().int().positive()}))});
export const DomainPage=z.object({items:z.array(DomainOption),nextCursor:z.string().nullable()});
export const SuggestionAction=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('confirm'),domain:declaredTokenDomain,confirmation:z.string(),latestAttemptId:z.uuid(),members:z.array(z.object({elementId:z.uuid(),version:z.number().int().positive()}))}),
 z.strictObject({action:z.enum(['reject','not_sure']),latestAttemptId:z.uuid()}),
]);
export const Attempt=z.object({id:z.uuid(),operation:z.enum(['query','explain']),at:z.string(),agentId:z.string(),statement:z.string().nullable(),argumentVisibility:z.enum(['hidden','literal_stripped','raw'])});
export const AttemptPage=z.object({items:z.array(Attempt),nextCursor:z.string().nullable()});
export const SuggestionQuery=z.object({cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(25)});
export const DomainQuery=z.object({cursor:z.string().max(512).optional(),limit:z.coerce.number().int().min(1).max(100).default(25)});
export type Suggestion=z.infer<typeof Suggestion>;

export const SuggestionListQuery=SuggestionQuery.extend({elementId:z.uuid().optional(),poolId:z.uuid().optional(),view:z.enum(['open','reviewed','all']).default('open')});
