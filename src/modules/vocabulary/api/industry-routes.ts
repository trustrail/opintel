import { z } from 'zod';
import { IndustryListResponse } from '../../../shared/api/tenancy-schemas.js';
import { defineRoute } from '../../../platform/http/index.js';
import type { ListIndustriesService } from '../application/list-industries.js';

export function industryRoutes(service: ListIndustriesService) {
  return [defineRoute({
    method: 'GET', path: '/api/v1/industries', permission: 'authenticated',
    params: z.object({}), request: z.undefined(), response: IndustryListResponse,
    handle: async () => {
      const result = await service.list();
      if (!result.ok) throw result.error;
      return { body: result.value };
    },
  })];
}
