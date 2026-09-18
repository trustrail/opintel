import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { CompanyId, IndustryId, ProjectName } from '../../../shared/kernel/index.js';
import type { CreateProjectService } from '../application/create-project.js';

const RegionSchema = z.enum(['eu-west-1', 'us-east-1', 'ap-southeast-1', 'ap-southeast-3']);

export const CreateProjectBody = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(80),
  industryId: z.string().uuid(),
  region: RegionSchema,
});

export const ProjectView = z.object({
  id: z.string().uuid(), companyId: z.string().uuid(), name: z.string(),
  industry: z.object({ id: z.string().uuid(), name: z.string(), inheritedTermCount: z.number().int() }),
  region: RegionSchema,
  createdAt: z.string().datetime({ offset: true }),
});

export function projectRoutes(service: CreateProjectService) {
  return [defineRoute({
    method: 'POST', path: '/api/v1/projects',
    permission: { resource: 'company', id: (request) => request.body.companyId, permission: 'administer' },
    params: z.object({}), request: CreateProjectBody, response: z.union([ProjectView, errorEnvelopeSchema]),
    handle: async (request) => {
      const result = await service.create({
        companyId: CompanyId(request.body.companyId), name: ProjectName(request.body.name),
        industryId: IndustryId(request.body.industryId), region: request.body.region,
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
