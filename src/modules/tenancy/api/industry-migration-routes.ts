import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { IndustryId, ProjectId } from '../../../shared/kernel/index.js';
import { MigrateIndustryBody, MigrateIndustryPreview, ProjectView } from '../../../shared/api/tenancy-schemas.js';
import type { MigrateIndustryService } from '../application/migrate-industry.js';

export function industryMigrationRoutes(service: MigrateIndustryService) {
  return [defineRoute({
    method: 'POST', path: '/api/v1/projects/:id/migrate-industry',
    permission: { resource: 'project', id: (request) => request.params.id, permission: 'administer' },
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ dryRun: z.enum(['true', 'false']).optional() }),
    request: MigrateIndustryBody, response: z.union([MigrateIndustryPreview, ProjectView, errorEnvelopeSchema]),
    handle: async (request) => {
      const result = await service.migrate({
        projectId: ProjectId(request.params.id), userId: request.actor.id,
        industryId: IndustryId(request.body.industryId), confirmation: request.body.confirmation,
        dryRun: request.query.dryRun === 'true',
      });
      if (!result.ok) throw result.error;
      return { status: 200, body: result.value };
    },
  })];
}
