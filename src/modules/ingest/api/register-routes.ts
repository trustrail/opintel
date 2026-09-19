import { z } from 'zod';
import { cursorPagination, defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { filingListResponseSchema } from '../../../shared/landing-contract.js';
import { DomainError, ProjectId, FilingId } from '../../../shared/kernel/index.js';
import type { FilingRegisterRepository } from '../application/register.js';
const cursorValue = z.object({ project: z.uuid(), filing: z.uuid() });
const cursor = z.string().max(1024).transform((value, ctx) => {
  try { if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error(); return cursorValue.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); }
  catch { ctx.addIssue({ code: 'custom', message: 'Invalid filing cursor.' }); return z.NEVER; }
});
export function registerRoutes(service: FilingRegisterRepository) {
  return [defineRoute({ method: 'GET', path: '/api/v1/projects/:id/filings',
    permission: { resource: 'project', id: (request) => request.params.id, permission: 'view' },
    params: z.object({ id: z.uuid() }), request: z.undefined(),
    query: z.object({ cursor: cursor.optional(), limit: z.coerce.number().int().positive().optional() }),
    response: z.union([filingListResponseSchema, errorEnvelopeSchema]),
    handle: async (request) => {
      if (request.query.cursor && request.query.cursor.project !== request.params.id) throw new DomainError('validation_failed', 'This cursor belongs to a different project.');
      const page = cursorPagination(undefined, request.query.limit);
      const result = await service.list(ProjectId(request.params.id), request.actor.id, request.query.cursor ? FilingId(request.query.cursor.filing) : null, page.limit + 1);
      if (!result.ok) throw result.error;
      const items = result.value.slice(0,page.limit);
      const last = items.at(-1);
      return { status: 200, headers: page.warning ? { Warning: page.warning } : undefined, body: { items,
        nextCursor: result.value.length > page.limit && last ? Buffer.from(JSON.stringify({ project: request.params.id, filing: last.filingId })).toString('base64url') : null } };
    },
  })];
}
