import { z } from 'zod';
import { defineRoute,errorEnvelopeSchema } from '../../../platform/http/index.js';
import { ProjectId,DomainError } from '../../../shared/kernel/index.js';
import { TokenKeyView,keyVersion } from '../../../shared/custody-contract.js';
import type { KeyCustodyService } from '../application/key-custody.js';
export function keyCustodyRoutes(service:KeyCustodyService){
 const params=z.object({id:z.uuid()});
 const actionRoutes=(['initialize','rotate','restore','rehearse'] as const).map(action=>defineRoute({
  method:'POST',path:`/api/v1/projects/:id/token-key/${action}`,params,
  permission:{resource:'project',id:request=>request.params.id,permission:action==='initialize'?'bind_source':'administer'},
  request:action==='rotate'?z.object({confirmation:z.string(),reason:z.string().min(1).max(500)}):action==='restore'?z.object({keyVersion,confirmation:z.string()}):z.object({}),
  response:z.union([TokenKeyView,errorEnvelopeSchema]),
  handle:async request=>{const key=request.headers['idempotency-key'];if(action==='rotate'&&(typeof key!=='string'||!key))throw new DomainError('validation_failed','Idempotency-Key is required for token key rotation.');const result=await service.execute({projectId:ProjectId(request.params.id),userId:request.actor.id},action,{...request.body,requestKey:typeof key==='string'?key:undefined});if(!result.ok)throw result.error;return {status:200,body:result.value};},
 }));
 return [defineRoute({method:'GET',path:'/api/v1/projects/:id/token-key',params,request:z.undefined(),
  permission:{resource:'project',id:request=>request.params.id,permission:'administer'},response:z.union([TokenKeyView,errorEnvelopeSchema]),
  handle:async request=>{const result=await service.execute({projectId:ProjectId(request.params.id),userId:request.actor.id},'status');if(!result.ok)throw result.error;return {status:200,body:result.value};},
 }),...actionRoutes];
}
