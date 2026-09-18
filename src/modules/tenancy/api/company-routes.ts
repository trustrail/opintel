import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { IndustryId } from '../../../shared/kernel/index.js';
import type { CreateCompanyService } from '../application/create-company.js';

import { CreateCompanyBody, CompanyView } from '../../../shared/api/tenancy-schemas.js';
export { CreateCompanyBody, CompanyView } from '../../../shared/api/tenancy-schemas.js';

export function companyRoutes(service: CreateCompanyService) {
  return [defineRoute({
    method: 'POST', path: '/api/v1/companies', permission: 'authenticated',
    params: z.object({}), request: CreateCompanyBody, response: z.union([CompanyView, errorEnvelopeSchema]),
    handle: async (request) => {
      const result = await service.create({
        ...request.body,
        defaultIndustryId: request.body.defaultIndustryId === null ? null : IndustryId(request.body.defaultIndustryId),
      }, request.actor.id);
      if (!result.ok) {
        return {
          status: result.error.code === 'validation_failed' ? 400 : 503,
          body: { error: {
            code: result.error.code, message: result.error.message, details: result.error.details,
            requestId: request.requestId, retryable: result.error.retryable,
          } },
        };
      }
      return { status: 201, body: result.value };
    },
  })];
}
