import {z} from 'zod';
import {BulkEntitlementBody} from './bulk-entitlements.js';
import {createApiClient} from './client.js';
export const GroupFilter=z.object({projectId:z.uuid(),sourceId:z.uuid().optional(),elementId:z.uuid().optional(),prefix:z.string().max(63).default(''),decision:z.enum(['undecided','decided','all']).default('undecided'),mode:z.enum(['name','table']).default('name'),cursor:z.string().max(2048).optional(),limit:z.coerce.number().int().positive().optional()});
export const MemberFilter=GroupFilter.extend({group:z.string().max(512).optional()});
export type GroupFilter=z.infer<typeof GroupFilter>;
export type MemberFilter=z.infer<typeof MemberFilter>;
const count=z.number().int().nonnegative();
const decision=z.enum(['undecided','clear','tokenized','masked','aggregate_only','withheld']);
export const DecisionCounts=z.array(z.object({value:decision,count}));
export const EntitlementMember=z.object({id:z.uuid(),group:z.string(),name:z.string().nullable(),qualifiedName:z.string(),objectId:z.uuid(),objectName:z.string(),objectLabel:z.string(),sourceId:z.uuid(),exposedType:z.string().nullable(),sourceType:z.string(),treatment:BulkEntitlementBody.shape.treatment.nullable(),maskKind:BulkEntitlementBody.shape.maskKind,justification:z.string().nullable()});
export type EntitlementMember=z.infer<typeof EntitlementMember>;
export const EntitlementGroup=z.object({groupKey:z.string(),name:z.string(),count,types:z.array(z.object({value:z.string().nullable(),count})),decisions:DecisionCounts,maskKinds:z.array(z.object({value:z.enum(['all','last4','email','year']),count})).default([]),objects:count,queries:count,explains:count});
export type EntitlementGroup=z.infer<typeof EntitlementGroup>;
export const GroupPage=z.object({items:z.array(EntitlementGroup),nextCursor:z.string().nullable(),totals:z.object({members:count,groups:count,undecided:count,decisions:DecisionCounts})});
export const MemberPage=z.object({items:z.array(EntitlementMember),nextCursor:z.string().nullable()});
export function readGroups(pool:string,filter:GroupFilter,client=createApiClient()){const q=new URLSearchParams();for(const [k,v] of Object.entries(filter))if(v!==undefined)q.set(k,String(v));return client.request({path:`/api/v1/pools/${pool}/entitlement-groups?${q}`,response:GroupPage});}
export function readMembers(pool:string,filter:MemberFilter,client=createApiClient()){const q=new URLSearchParams();for(const [k,v] of Object.entries(filter))if(v!==undefined)q.set(k,String(v));return client.request({path:`/api/v1/pools/${pool}/entitlement-members?${q}`,response:MemberPage});}
