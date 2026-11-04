import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {ChangeIdentityBinding} from '../../../shared/api/credential-identity.js';
import {PoolId,ProjectId} from '../../../shared/kernel/index.js';
import {CredentialId} from '../domain/pool.js';
import type {CredentialBindings} from '../application/identity-binding.js';
export function identityBindingRoutes(bindings:CredentialBindings){return [defineRoute({method:'POST',path:'/api/v1/pools/:id/credentials/:credentialId/identity',params:z.object({id:z.uuid(),credentialId:z.uuid()}),request:ChangeIdentityBinding,response:z.object({changed:z.literal(true)}),permission:{resource:'project',id:r=>r.body.projectId,permission:'administer'},handle:async r=>{const result=await bindings.change({projectId:ProjectId(r.body.projectId),userId:r.actor.id},PoolId(r.params.id),CredentialId(r.params.credentialId),r.body.action,r.body.confirmation);if(!result.ok)throw result.error;return {body:{changed:true as const},headers:{'cache-control':'no-store'}};}})];}
