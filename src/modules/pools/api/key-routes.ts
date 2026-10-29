import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { CredentialRevoked,IssueCredentialBody,RevokeCredentialBody,CreatePoolBody,RotatePoolKeyBody,RevokePoolKeyBody,PoolKeyCreationResponse,PoolKeyRevoked,PoolKeyAffected } from '../../../shared/api/pool-keys.js';
import { PoolId,ProjectId } from '../../../shared/kernel/index.js';
import type { PoolKeyService } from '../application/keys.js';
import { CredentialId, poolKeyId } from '../domain/pool.js';
import {poolTableSelection} from '../application/tables.js';
export function poolKeyRoutes(service:PoolKeyService) {
 const params=z.object({id:z.uuid()});
 return [
  defineRoute({method:'POST',path:'/api/v1/projects/:id/pools',params,request:CreatePoolBody,response:z.union([PoolKeyCreationResponse,errorEnvelopeSchema]),
   permission:{resource:'project',id:r=>r.params.id,permission:'administer'},handle:async r=>{
    const result=await service.execute({projectId:ProjectId(r.params.id),userId:r.actor.id},{kind:'create',name:r.body.name,...r.body.budgets?{budgets:r.body.budgets}:{},...r.body.tableSetup?{tableSetup:poolTableSelection(r.body.tableSetup)}:{},...r.body.certificateAssociation?{certificateAssociation:r.body.certificateAssociation}:{}},r.headers['idempotency-key']);
    if(!result.ok){if(result.error.code==='idempotency_key_reused')return {status:409,body:{error:{code:result.error.code,message:result.error.message,requestId:r.requestId,retryable:false}}};throw result.error;}return {body:PoolKeyCreationResponse.parse(result.value),headers:{'cache-control':'no-store'}};
   }}),
  defineRoute({method:'POST',path:'/api/v1/pools/:id/keys/rotate',params,request:RotatePoolKeyBody,response:z.union([PoolKeyCreationResponse,errorEnvelopeSchema]),
   permission:{resource:'project',id:r=>r.body.projectId,permission:'administer'},handle:async r=>{
    const result=await service.execute({projectId:ProjectId(r.body.projectId),userId:r.actor.id},{kind:'rotate',poolId:PoolId(r.params.id),...r.body.credentialId?{credentialId:CredentialId(r.body.credentialId)}:{}},r.headers['idempotency-key']);
    if(!result.ok){if(result.error.code==='idempotency_key_reused')return {status:409,body:{error:{code:result.error.code,message:result.error.message,requestId:r.requestId,retryable:false}}};throw result.error;}return {body:PoolKeyCreationResponse.parse(result.value),headers:{'cache-control':'no-store'}};
   }}),
  defineRoute({method:'POST',path:'/api/v1/pools/:id/keys/revoke',params,request:RevokePoolKeyBody,response:z.union([PoolKeyRevoked,errorEnvelopeSchema]),
   permission:{resource:'project',id:r=>r.body.projectId,permission:'administer'},handle:async r=>{
    const version=poolKeyId(r.body.keyVersion);if(!version.ok)throw version.error;
    const result=await service.execute({projectId:ProjectId(r.body.projectId),userId:r.actor.id},{kind:'revoke',poolId:PoolId(r.params.id),keyVersion:version.value,confirmation:r.body.confirmation},r.headers['idempotency-key']);
    if(!result.ok){if(result.error.code==='idempotency_key_reused')return {status:409,body:{error:{code:result.error.code,message:result.error.message,requestId:r.requestId,retryable:false}}};throw result.error;}return {body:PoolKeyRevoked.parse(result.value),headers:{'cache-control':'no-store'}};
   }}),
  defineRoute({method:'POST',path:'/api/v1/pools/:id/credentials',params,request:IssueCredentialBody,response:PoolKeyCreationResponse,
   permission:{resource:'project',id:r=>r.body.projectId,permission:'administer'},handle:async r=>{const result=await service.execute({projectId:ProjectId(r.body.projectId),userId:r.actor.id},{kind:'issue',poolId:PoolId(r.params.id),label:r.body.label,...r.body.certificateAssociation?{certificateAssociation:r.body.certificateAssociation}:{}},r.headers['idempotency-key']);if(!result.ok)throw result.error;return {body:PoolKeyCreationResponse.parse(result.value),headers:{'cache-control':'no-store'}};}}),
  defineRoute({method:'POST',path:'/api/v1/pools/:id/credentials/revoke',params,request:RevokeCredentialBody,response:CredentialRevoked,
   permission:{resource:'project',id:r=>r.body.projectId,permission:'administer'},handle:async r=>{const result=await service.execute({projectId:ProjectId(r.body.projectId),userId:r.actor.id},{kind:'revokeCredential',poolId:PoolId(r.params.id),credentialId:CredentialId(r.body.credentialId),confirmation:r.body.confirmation,...r.body.confirmedLiveGrants!==undefined?{confirmedLiveGrants:r.body.confirmedLiveGrants}:{}},r.headers['idempotency-key']);if(!result.ok)throw result.error;return {body:CredentialRevoked.parse(result.value),headers:{'cache-control':'no-store'}};}}),
  defineRoute({method:'GET',path:'/api/v1/pools/:id/keys/:keyVersion/affected-agents',params:z.object({id:z.uuid(),keyVersion:z.uuid()}),query:z.object({projectId:z.uuid()}),request:z.undefined(),response:PoolKeyAffected,
   permission:{resource:'project',id:r=>r.query.projectId,permission:'administer'},handle:async r=>{
    const version=poolKeyId(r.params.keyVersion);if(!version.ok)throw version.error;
    const result=await service.affected({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id),version.value);
    if(!result.ok)throw result.error;return {body:PoolKeyAffected.parse(result.value),headers:{'cache-control':'no-store'}};
   }}),
 ];
}
