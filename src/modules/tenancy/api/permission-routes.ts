import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { ExplainResponse } from '../../../shared/api/tenancy-schemas.js';
import { ProjectId, UserId } from '../../../shared/kernel/index.js';
import type { ExplainPermissionsService } from '../application/explain-permissions.js';

export function permissionRoutes(service: ExplainPermissionsService) {
  return [defineRoute({
    method: 'GET', path: '/api/v1/projects/:id/permissions/:userId/explain',
    permission: { resource: 'project', id: (request) => request.params.id, permission: 'view' },
    params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
    request: z.undefined(), response: z.union([ExplainResponse, errorEnvelopeSchema]),
    handle: async (request) => {
      const result = await service.explain(ProjectId(request.params.id), UserId(request.params.userId));
      if (!result.ok) throw result.error;
      return { status: 200, body: result.value };
    },
  })];
}
