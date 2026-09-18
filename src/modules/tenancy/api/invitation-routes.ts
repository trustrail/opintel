import { z } from 'zod';
import { cursorPagination, defineRoute } from '../../../platform/http/index.js';
import { CompanyId, DomainError, InviteId, ProjectId } from '../../../shared/kernel/index.js';
import type { InvitationService } from '../application/invitations.js';

export const CreateInvitationBody = z.object({
  email: z.string().email(), companyId: z.string().uuid(), projectId: z.string().uuid().nullable(),
  role: z.enum(['admin', 'operator', 'viewer']),
});
export const InvitationListItem = CreateInvitationBody.extend({
  id: z.string().uuid(), email: z.string(), invitedBy: z.object({ id: z.string().uuid(), email: z.string() }),
  expiresAt: z.string().datetime({ offset: true }), createdAt: z.string().datetime({ offset: true }),
});
const params = z.object({ id: z.string().uuid() });
const cursor = z.string().max(1024).transform((value, ctx) => {
  try { return z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); }
  catch { ctx.addIssue({ code: 'custom', message: 'Invalid invitation cursor.' }); return z.NEVER; }
});

export function invitationRoutes(service: InvitationService) {
  return [
    defineRoute({ method: 'POST', path: '/api/v1/projects/:id/invitations', params,
      permission: { resource: 'project', id: (request) => request.params.id, permission: 'administer' },
      request: CreateInvitationBody, response: InvitationListItem,
      handle: async (request) => {
        const result = await service.create({ ...request.body, companyId: CompanyId(request.body.companyId), projectId: request.body.projectId === null ? null : ProjectId(request.body.projectId) }, ProjectId(request.params.id), request.actor.id);
        if (!result.ok) throw result.error;
        return { status: 201, body: result.value };
      },
    }),
    defineRoute({ method: 'GET', path: '/api/v1/projects/:id/invitations', params,
      permission: { resource: 'project', id: (request) => request.params.id, permission: 'view' },
      request: z.undefined(), query: z.object({ cursor: cursor.optional(), limit: z.coerce.number().int().positive().optional() }),
      response: z.object({ items: z.array(InvitationListItem), nextCursor: z.string().nullable() }),
      handle: async (request) => {
        if (request.query.cursor !== undefined && request.query.cursor.projectId !== request.params.id) throw new DomainError('validation_failed', 'The invitation cursor belongs to another project.');
        const page = cursorPagination(undefined, request.query.limit);
        const result = await service.list(ProjectId(request.params.id), request.query.cursor === undefined ? null : InviteId(request.query.cursor.id), page.limit);
        if (!result.ok) throw result.error;
        return { body: { items: result.value.items, nextCursor: result.value.nextId === null ? null : Buffer.from(JSON.stringify({ projectId: request.params.id, id: result.value.nextId })).toString('base64url') } };
      },
    }),
    defineRoute({ method: 'DELETE', path: '/api/v1/invitations/:id', params, permission: 'authenticated',
      request: z.undefined(), response: z.undefined(), handle: async (request) => {
        const result = await service.revoke(InviteId(request.params.id), request.actor.id);
        if (!result.ok) throw result.error;
        return { status: 204, body: undefined };
      },
    }),
  ];
}
