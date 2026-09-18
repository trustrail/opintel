import { z } from 'zod';
import { cursorPagination, defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import type { TenancyListService } from '../application/list-tenancy.js';

export const ProjectListItem = z.object({
  id: z.string().uuid(), name: z.string(),
  region: z.enum(['eu-west-1', 'us-east-1', 'ap-southeast-1', 'ap-southeast-3']),
  company: z.object({ id: z.string().uuid(), name: z.string() }),
  industry: z.object({ id: z.string().uuid(), name: z.string() }),
  role: z.enum(['admin', 'operator', 'viewer']),
  archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export const ProjectListResponse = z.object({ items: z.array(ProjectListItem), nextCursor: z.string().nullable() });
export const CompanyListItem = z.object({
  id: z.string().uuid(), name: z.string(), role: z.enum(['admin', 'member']), projectCount: z.number().int(),
});
export const CompanyListResponse = z.object({ items: z.array(CompanyListItem), nextCursor: z.string().nullable() });

const cursorValue = z.object({ id: z.string().uuid(), kind: z.enum(['projects', 'companies']), includeArchived: z.boolean() });
const cursorSchema = z.string().max(1024).transform((value, ctx) => {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid cursor encoding.');
    return cursorValue.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid cursor.' });
    return z.NEVER;
  }
});
const paginationQuery = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const projectsQuery = paginationQuery.extend({
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
}).refine((query) => query.cursor === undefined || (query.cursor.kind === 'projects' && query.cursor.includeArchived === query.includeArchived));
const companiesQuery = paginationQuery.refine((query) => query.cursor === undefined || (query.cursor.kind === 'companies' && !query.cursor.includeArchived));

function encodeCursor(id: string | null, kind: 'projects' | 'companies', includeArchived: boolean): string | null {
  return id === null ? null : Buffer.from(JSON.stringify({ id, kind, includeArchived })).toString('base64url');
}

export function tenancyListRoutes(service: TenancyListService) {
  return [
    defineRoute({
      method: 'GET', path: '/api/v1/projects', permission: 'authenticated', params: z.object({}),
      request: z.undefined(), query: projectsQuery, response: z.union([ProjectListResponse, errorEnvelopeSchema]),
      handle: async (request) => {
        const page = cursorPagination(undefined, request.query.limit);
        const result = await service.projects(request.actor.id, request.query.cursor?.id ?? null, page.limit, request.query.includeArchived);
        if (!result.ok) return { status: 503, body: { error: { ...result.error, requestId: request.requestId } } };
        const items = result.value.items.map(({ archivedAt, ...item }) => request.query.includeArchived ? { ...item, archivedAt } : item);
        return { headers: page.warning === undefined ? undefined : { Warning: page.warning }, body: {
          items, nextCursor: encodeCursor(result.value.nextId, 'projects', request.query.includeArchived),
        } };
      },
    }),
    defineRoute({
      method: 'GET', path: '/api/v1/companies', permission: 'authenticated', params: z.object({}),
      request: z.undefined(), query: companiesQuery, response: z.union([CompanyListResponse, errorEnvelopeSchema]),
      handle: async (request) => {
        const page = cursorPagination(undefined, request.query.limit);
        const result = await service.companies(request.actor.id, request.query.cursor?.id ?? null, page.limit);
        if (!result.ok) return { status: 503, body: { error: { ...result.error, requestId: request.requestId } } };
        return { headers: page.warning === undefined ? undefined : { Warning: page.warning }, body: {
          items: result.value.items, nextCursor: encodeCursor(result.value.nextId, 'companies', false),
        } };
      },
    }),
  ];
}
