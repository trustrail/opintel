import { z } from 'zod';
import { cursorPagination, defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { ProjectMemberListResponse } from '../../../shared/api/tenancy-schemas.js';
import { DomainError, ProjectId, UserId } from '../../../shared/kernel/index.js';
import type { ListMembersService } from '../application/list-members.js';

const cursorValue = z.object({ project: z.string().uuid(), user: z.string().uuid() });
const cursor = z.string().max(1024).transform((value, ctx) => {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid cursor.');
    return cursorValue.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid member cursor.' });
    return z.NEVER;
  }
});

export function memberRoutes(service: ListMembersService) {
  return [defineRoute({
    method: 'GET', path: '/api/v1/projects/:id/members',
    permission: { resource: 'project', id: (request) => request.params.id, permission: 'view' },
    params: z.object({ id: z.string().uuid() }), request: z.undefined(),
    query: z.object({ cursor: cursor.optional(), limit: z.coerce.number().int().positive().optional() }),
    response: z.union([ProjectMemberListResponse, errorEnvelopeSchema]),
    handle: async (request) => {
      if (request.query.cursor !== undefined && request.query.cursor.project !== request.params.id) {
        throw new DomainError('validation_failed', 'This cursor belongs to a different project.');
      }
      const page = cursorPagination(undefined, request.query.limit);
      const result = await service.list(ProjectId(request.params.id), request.query.cursor === undefined ? null : UserId(request.query.cursor.user), page.limit);
      if (!result.ok) throw result.error;
      return { status: 200, headers: page.warning === undefined ? undefined : { Warning: page.warning }, body: {
        items: result.value.items,
        nextCursor: result.value.nextId === null ? null : Buffer.from(JSON.stringify({ project: request.params.id, user: result.value.nextId })).toString('base64url'),
      } };
    },
  })];
}
