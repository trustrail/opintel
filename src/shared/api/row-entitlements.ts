import {rowPreviewResponse} from '../row-preview-contract.js';
import {z} from 'zod';
import {predicateColumn} from '../row-scope-contract.js';
import {createApiClient} from './client.js';
export const RowDecisionLevel=z.enum(['object_default','pool_override']);
export const RowDecision=z.object({id:z.uuid(),expression:z.string(),hash:z.string(),actorId:z.uuid(),decidedAt:z.string(),firstScoping:z.boolean(),level:RowDecisionLevel.default('pool_override')});
export const RowDecisionRead=z.object({objectId:z.uuid(),objectName:z.string(),poolId:z.uuid(),scoped:z.boolean(),columns:z.array(predicateColumn),current:RowDecision.nullable(),objectDefault:RowDecision.nullable().default(null),effectiveExpression:z.string().nullable().default(null),pools:z.array(z.object({id:z.uuid(),name:z.string(),status:z.enum(['inherited','overridden','unscoped','missing'])})).default([])});
export const RowDecisionBody=z.object({projectId:z.uuid(),expression:z.string().min(1).max(8192),level:RowDecisionLevel.default('pool_override')});
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
  '/api/v1/pools/{id}/row-entitlements/{objectId}/preview':{post:{description:'Project set_entitlement permission only. Privileged, evidenced Engine preview; never an MCP tool. No release grant.',parameters:parameters.filter(p=>p.in==='path'),requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(RowDecisionBody)}}},responses:{'200':{description:'Exact counts and at most five treated samples',content:{'application/json':{schema:z.toJSONSchema(rowPreviewResponse)}}}}}},
  '/api/v1/row-decisions/{id}':{get:{description:'Project set_entitlement permission. Immutable historical decision text.',parameters:parameters.filter(p=>p.name!=='objectId'),responses:response('RowDecision')}},
  '/api/v1/pools/{id}/row-entitlements':{get:{description:'Project set_entitlement permission. Cursored object inheritance states.',parameters:[...parameters.filter(p=>p.name!=='objectId'),{name:'cursor',in:'query',required:false,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Pool row access',content:{'application/json':{schema:z.toJSONSchema(PoolRowObjects)}}}}}},
  '/api/v1/pools/{id}/row-entitlements/{objectId}/history':{get:{description:'Project set_entitlement permission. Immutable decision history, including administrator-only predicate literals.',parameters:[...parameters,{name:'cursor',in:'query',required:false,schema:{type:'string',pattern:'^\\d+$'}}],responses:response('RowDecisionHistory')}}
 }};
}

export function previewRowDecision(poolId:string,objectId:string,body:z.infer<typeof RowDecisionBody>,client=createApiClient()){return client.request({method:'POST',path:`/api/v1/pools/${poolId}/row-entitlements/${objectId}/preview`,body,response:rowPreviewResponse});}

export const PoolRowObjects=z.object({items:z.array(z.object({id:z.uuid(),name:z.string(),status:z.enum(['inherited','overridden','missing','unscoped'])})),nextCursor:z.string().nullable()});
export function readPoolRowObjects(projectId:string,poolId:string,cursor?:string,client=createApiClient()){return client.request({path:`/api/v1/pools/${poolId}/row-entitlements?${new URLSearchParams({projectId,...cursor?{cursor}:{}})}`,response:PoolRowObjects});}
export function readHistoricalRowDecision(projectId:string,id:string,client=createApiClient()){return client.request({path:`/api/v1/row-decisions/${id}?projectId=${projectId}`,response:RowDecision});}
