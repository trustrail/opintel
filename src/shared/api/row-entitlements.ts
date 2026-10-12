import {z} from 'zod';
import {predicateColumn} from '../row-scope-contract.js';
import {createApiClient} from './client.js';
export const RowDecision=z.object({id:z.uuid(),expression:z.string(),hash:z.string(),actorId:z.uuid(),decidedAt:z.string(),firstScoping:z.boolean()});
export const RowDecisionRead=z.object({objectId:z.uuid(),objectName:z.string(),poolId:z.uuid(),scoped:z.boolean(),columns:z.array(predicateColumn),current:RowDecision.nullable()});
export const RowDecisionBody=z.object({projectId:z.uuid(),expression:z.string().min(1).max(8192)});
export const RowDecisionQuery=z.object({projectId:z.uuid()});
export function readRowDecision(projectId:string,poolId:string,objectId:string,client=createApiClient()){return client.request({path:`/api/v1/pools/${poolId}/row-entitlements/${objectId}?projectId=${projectId}`,response:RowDecisionRead});}
export function saveRowDecision(poolId:string,objectId:string,body:z.infer<typeof RowDecisionBody>,client=createApiClient()){return client.request({method:'PUT',path:`/api/v1/pools/${poolId}/row-entitlements/${objectId}`,body,response:RowDecision});}
export const RowDecisionHistory=z.object({items:z.array(RowDecision),nextCursor:z.string().nullable()});
export const RowHistoryQuery=RowDecisionQuery.extend({cursor:z.string().regex(/^\d+$/u).optional()});
export function readRowHistory(projectId:string,poolId:string,objectId:string,cursor?:string,client=createApiClient()){return client.request({path:`/api/v1/pools/${poolId}/row-entitlements/${objectId}/history?${new URLSearchParams({projectId,...cursor?{cursor}:{}})}`,response:RowDecisionHistory});}
export function rowEntitlementsOpenApiDocument(){
 const schemas={RowDecision:z.toJSONSchema(RowDecision),RowDecisionRead:z.toJSONSchema(RowDecisionRead),RowDecisionHistory:z.toJSONSchema(RowDecisionHistory)};
 const parameters=[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'objectId',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}}];
 const response=(name:keyof typeof schemas)=>({'200':{description:'Row decision',content:{'application/json':{schema:schemas[name]}}}});
 return {openapi:'3.1.0',info:{title:'Static row entitlements',version:'1'},paths:{
  '/api/v1/pools/{id}/row-entitlements/{objectId}':{get:{description:'Project set_entitlement permission. Current decision and catalogue-typed inputs.',parameters,responses:response('RowDecisionRead')},put:{description:'Project set_entitlement permission. Append an immutable static predicate decision; scope references are reserved for step 3.',parameters:parameters.filter(p=>p.in==='path'),requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(RowDecisionBody)}}},responses:response('RowDecision')}},
  '/api/v1/pools/{id}/row-entitlements/{objectId}/history':{get:{description:'Project set_entitlement permission. Immutable decision history, including administrator-only predicate literals.',parameters:[...parameters,{name:'cursor',in:'query',required:false,schema:{type:'string',pattern:'^\\d+$'}}],responses:response('RowDecisionHistory')}}
 }};
}
