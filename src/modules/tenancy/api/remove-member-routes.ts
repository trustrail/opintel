import {z} from 'zod';
import {defineRoute,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {ProjectId,UserId} from '../../../shared/kernel/index.js';
import {ProjectGrantRemovalResponse} from '../../../shared/api/project-members.js';
import type {RemoveProjectMemberService} from '../application/remove-member.js';
export function memberRemovalRoutes(service:RemoveProjectMemberService){return [defineRoute({method:'DELETE',path:'/api/v1/projects/:id/members/:userId',params:z.object({id:z.uuid(),userId:z.uuid()}),request:z.undefined(),response:z.union([ProjectGrantRemovalResponse,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'administer'},handle:async r=>{const result=await service.remove(ProjectId(r.params.id),UserId(r.params.userId),r.actor.id);if(!result.ok)throw result.error;return {body:result.value,headers:{'cache-control':'no-store'}};}})];}
