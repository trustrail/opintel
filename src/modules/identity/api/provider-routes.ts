import { z } from 'zod';
import { defineRoute } from '../../../platform/http/index.js';
import { isProviderLookupEmail, type ProviderResolutionService } from '../application/providers.js';

const emptyParams = z.object({});
const emptyBody = z.undefined();
const providerOption = z.object({ provider: z.string(), displayName: z.string(), startPath: z.string() });
const response = z.object({ magicLink: z.boolean(), providers: z.array(providerOption), enforced: z.string().nullable() });
const query = z.object({ email: z.string().max(320).refine(isProviderLookupEmail) });

export function providerRoutes(service: ProviderResolutionService) {
  return [defineRoute({
    method: 'GET', path: '/api/v1/auth/providers', params: emptyParams, query,
    request: emptyBody, response,
    handle: async (request) => ({ body: await service.resolve(request.query.email) }),
  })];
}
