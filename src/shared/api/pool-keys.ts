import { z } from 'zod';
import { createApiClient } from './client.js';
export const PoolKeyGraceSeconds = z.number().int().min(3600).max(604800).default(86400);
export const PoolKeyIdempotency = z.string().trim().min(1).max(200);
export const CreatePoolBody = z.strictObject({name:z.string().trim().min(1).max(80)});
export const RotatePoolKeyBody = z.strictObject({projectId:z.uuid()});
export const RevokePoolKeyBody = z.strictObject({projectId:z.uuid(),keyVersion:z.uuid(),confirmation:z.string().min(1)});
export const PoolKeyMetadata = z.strictObject({poolId:z.uuid(),keyVersion:z.uuid(),prefix:z.string().regex(/^opk_live_[A-Za-z0-9]{1,21}$/u),createdAt:z.iso.datetime(),state:z.enum(['current','retiring','revoked','expired']),graceUntil:z.iso.datetime().nullable()});
export type PoolKeyMetadata = z.infer<typeof PoolKeyMetadata>;
export const PoolKeyReplay = PoolKeyMetadata.extend({keyShown:z.literal(false)});
export const PoolKeyIssued = PoolKeyMetadata.extend({keyShown:z.literal(true),key:z.string().regex(/^opk_live_[A-Za-z0-9]{22}$/u)});
export const PoolKeyCreationResponse = z.union([PoolKeyIssued,PoolKeyReplay]);
export type PoolKeyCreationResponse = z.infer<typeof PoolKeyCreationResponse>;
export const PoolKeyAffected = PoolKeyMetadata.extend({affectedAgentCount:z.number().int().nonnegative(),affectedAgents:z.array(z.string())});
export const PoolKeyRevoked = PoolKeyReplay.extend({affectedAgentCount:z.number().int().nonnegative(),affectedAgents:z.array(z.string())});
export const PoolKeyStored = z.union([PoolKeyRevoked,PoolKeyReplay]);
export type PoolKeyStored = z.infer<typeof PoolKeyStored>;
export function createPool(projectId:string,body:z.input<typeof CreatePoolBody>,idempotencyKey:string,client=createApiClient()) {
 return client.request({path:`/api/v1/projects/${projectId}/pools`,method:'POST',body,headers:{'Idempotency-Key':idempotencyKey},response:PoolKeyCreationResponse});
}
export function rotatePoolKey(poolId:string,body:z.input<typeof RotatePoolKeyBody>,idempotencyKey:string,client=createApiClient()) {
 return client.request({path:`/api/v1/pools/${poolId}/keys/rotate`,method:'POST',body,headers:{'Idempotency-Key':idempotencyKey},response:PoolKeyCreationResponse});
}
export function revokePoolKey(poolId:string,body:z.input<typeof RevokePoolKeyBody>,idempotencyKey:string,client=createApiClient()) {
 return client.request({path:`/api/v1/pools/${poolId}/keys/revoke`,method:'POST',body,headers:{'Idempotency-Key':idempotencyKey},response:PoolKeyRevoked});
}
export function affectedPoolKeyAgents(poolId:string,keyVersion:string,projectId:string,client=createApiClient()) {
 return client.request({path:`/api/v1/pools/${poolId}/keys/${keyVersion}/affected-agents?projectId=${encodeURIComponent(projectId)}`,method:'GET',response:PoolKeyAffected});
}
export function poolKeyOpenApiDocument() {
 const pathParameter={name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}};
 const responseContent=(schema:z.ZodType)=>({'application/json':{schema:z.toJSONSchema(schema)}});
 const commands=[['/api/v1/projects/{id}/pools',CreatePoolBody,PoolKeyCreationResponse],['/api/v1/pools/{id}/keys/rotate',RotatePoolKeyBody,PoolKeyCreationResponse],['/api/v1/pools/{id}/keys/revoke',RevokePoolKeyBody,PoolKeyRevoked]] as const;
 const paths=Object.fromEntries(commands.map(([path,request,response])=>[path,{post:{
  description:'Requires project#administer. Creation/rotation retries return metadata with keyShown: false and no key.',
  parameters:[pathParameter,{name:'Idempotency-Key',in:'header',required:true,schema:z.toJSONSchema(PoolKeyIdempotency)}],
  requestBody:{required:true,content:responseContent(request)},
  responses:{200:{description:'Decision committed',content:responseContent(response)},default:{description:'Error envelope: malformed command, permission denied, conflict or dependency unavailable.'}},
 }}]));
 return {openapi:'3.1.0',info:{title:'Pool keys',version:'1'},paths:{...paths,
  '/api/v1/pools/{id}/keys/{keyVersion}/affected-agents':{get:{
   description:'Requires project#administer. Metadata and agents affected by this key version; never a credential.',
   parameters:[pathParameter,{name:'keyVersion',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}}],
   responses:{200:{description:'Affected agents',content:responseContent(PoolKeyAffected)},default:{description:'Error envelope'}},
  }},
 }};
}
