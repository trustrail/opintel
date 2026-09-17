import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { IndustryId } from '../../../shared/kernel/index.js';
import type { CreateCompanyService } from '../application/create-company.js';

const RegionSchema = z.enum(['eu-west-1', 'us-east-1', 'ap-southeast-1', 'ap-southeast-3']);

export const CreateCompanyBody = z.object({
  name: z.string().min(1).max(120),
  defaultRegion: RegionSchema,
  defaultIndustryId: z.string().uuid().nullable(),
});

export const CompanyView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  defaultRegion: RegionSchema,
  defaultIndustryId: z.string().uuid().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

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
