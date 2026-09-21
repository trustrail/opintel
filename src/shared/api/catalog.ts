import { z } from 'zod';
import { createApiClient } from './client.js';

export const CatalogNode = z.object({
  kind: z.enum(['source', 'schema', 'object', 'element']),
  id: z.string(), label: z.string().nullable(), childCount: z.number().int().nullable(),
  duckdbType: z.string().nullable(),
  state: z.enum(['undecided', 'entitled', 'withheld', 'unsupported', 'unnameable']).nullable(),
});
export type CatalogNode = z.infer<typeof CatalogNode>;
export const CatalogTreeResponse = z.object({ nodes: z.array(CatalogNode), nextCursor: z.string().nullable() });
export const CatalogTreeQuery = z.object({
  parent: z.string().max(512).optional(), prefix: z.string().max(63).default(''),
  cursor: z.string().max(2048).optional(), limit: z.coerce.number().int().positive().optional(),
});
export type CatalogPage = { parent?: string; prefix?: string; cursor?: string; limit?: number };
export function catalogPage(projectId: string, page: CatalogPage, client = createApiClient()) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(page)) if (value !== undefined) query.set(key, String(value));
  return client.request({ path: `/api/v1/projects/${projectId}/catalog?${query}`, response: CatalogTreeResponse });
}
export function catalogOpenApiDocument() {
  const failure = z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string(),retryable:z.boolean(),details:z.record(z.string(),z.unknown()).optional()})});
  return { openapi: '3.1.0', components: {securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'opintel_session'}}}, security:[{sessionCookie:[]}], info: { title: 'Opintel catalogue', version: '1' }, paths: {
    '/api/v1/projects/{id}/catalog': { get: {
      description: 'Requires project#view. One level per request. Prefix applies only to that level. IDs and cursors are opaque.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ...Object.entries(z.toJSONSchema(CatalogTreeQuery).properties ?? {}).map(([name, schema]) => ({ name, in: 'query', schema }))],
      responses: { default: {description:'Standard error envelope',content:{'application/json':{schema:z.toJSONSchema(failure)}}}, '200': { description: 'Catalogue level', content: { 'application/json': { schema: z.toJSONSchema(CatalogTreeResponse) } } } },
    } },
  } };
}
