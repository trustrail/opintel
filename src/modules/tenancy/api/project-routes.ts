import {PairedEngineCandidates} from '../../../shared/api/tenancy-schemas.js';
import type {PairedEngineCandidates as CandidatesPort} from '../application/paired-engines.js';
import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { CompanyId, IndustryId, ProjectId, ProjectName,UserId } from '../../../shared/kernel/index.js';
import type { CreateProjectService } from '../application/create-project.js';
import type { UpdateProjectService } from '../application/update-project.js';

import { CreateProjectBody, ProjectView, UpdateProjectBody } from '../../../shared/api/tenancy-schemas.js';
export { CreateProjectBody, ProjectView, UpdateProjectBody } from '../../../shared/api/tenancy-schemas.js';

export function projectUpdateRoutes(service: UpdateProjectService) {
  return [defineRoute({
    method: 'PATCH', path: '/api/v1/projects/:id',
    permission: { resource: 'project', id: (request) => request.params.id, permission: 'administer' },
    params: z.object({ id: z.string().uuid() }), request: UpdateProjectBody,
    response: z.union([ProjectView, errorEnvelopeSchema]),
    handle: async (request) => {
      const result = await service.rename(ProjectId(request.params.id), ProjectName(request.body.name),request.actor.id);
      if (!result.ok) {
        return { status: result.error.code === 'not_found' ? 404 : 409, body: { error: {
          code: result.error.code, message: result.error.message, details: result.error.details,
          requestId: request.requestId, retryable: result.error.retryable,
        } } };
      }
      return { status: 200, body: result.value };
    },
  })];
}

export function projectRoutes(service: CreateProjectService) {
  return [defineRoute({
    method: 'POST', path: '/api/v1/projects',
    permission: { resource: 'company', id: (request) => request.body.companyId, permission: 'administer' },
    params: z.object({}), request: CreateProjectBody, response: z.union([ProjectView, errorEnvelopeSchema]),
    handle: async (request) => {
      const result = await service.create({
        companyId: CompanyId(request.body.companyId), name: ProjectName(request.body.name),
        industryId: IndustryId(request.body.industryId), region: request.body.region,pairedEngineId:request.body.pairedEngineId,
      }, request.actor.id);
      if (!result.ok) {
        const status = result.error.code === 'validation_failed' ? 400
          : result.error.code === 'not_found' ? 404
            : result.error.code === 'conflict' ? 409 : 503;
        return { status, body: { error: {
          code: result.error.code, message: result.error.message, details: result.error.details,
          requestId: request.requestId, retryable: result.error.retryable,
        } } };
      }
      return { status: 201, body: result.value };
    },
  })];
}

export function pairedEngineRoutes(candidates:CandidatesPort){return [defineRoute({method:'GET',path:'/api/v1/companies/:id/paired-engines',params:z.object({id:z.uuid()}),request:z.undefined(),response:PairedEngineCandidates,permission:{resource:'company',id:r=>r.params.id,permission:'administer'},handle:async r=>({body:{items:await candidates.list(CompanyId(r.params.id),UserId(r.actor.id))},headers:{'cache-control':'no-store'}})})];}
