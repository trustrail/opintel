import { z } from 'zod';
import { defineRoute, cursorPagination, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { CatalogTreeQuery, CatalogTreeResponse } from '../../../shared/api/catalog.js';
import { DomainError, ProjectId } from '../../../shared/kernel/index.js';
import type { CatalogTreeReader } from '../application/tree.js';
const cursorShape = z.object({ project: z.uuid(), parent: z.string(), prefix: z.string(), after: z.string() });
export function catalogRoutes(reader: CatalogTreeReader) {
  return [defineRoute({ method: 'GET', path: '/api/v1/projects/:id/catalog', params: z.object({ id: z.uuid() }), request: z.undefined(),
    query: CatalogTreeQuery, permission: { resource: 'project', id: r => r.params.id, permission: 'view' },
    response: z.union([CatalogTreeResponse, errorEnvelopeSchema]), handle: async r => {
      const parent = r.query.parent ?? ''; const prefix = r.query.prefix;
      let after: string | null = null;
      if (r.query.cursor) {
        try {
          if (!/^[\w-]+$/u.test(r.query.cursor)) throw new Error();
          const cursor = cursorShape.parse(JSON.parse(Buffer.from(r.query.cursor, 'base64url').toString('utf8')));
          if (cursor.project !== r.params.id || cursor.parent !== parent || cursor.prefix !== prefix) throw new Error();
          after = cursor.after;
        } catch { throw new DomainError('validation_failed', 'This catalogue cursor is invalid or belongs to another project, branch or prefix.'); }
      }
      const page = cursorPagination(undefined, r.query.limit);
      const result = await reader.read({ projectId: ProjectId(r.params.id), userId: r.actor.id }, { parent, prefix, after, limit: page.limit + 1 });
      if (!result.ok) throw result.error;
      const entries = result.value.slice(0, page.limit);
      return { headers: page.warning ? { Warning: page.warning } : undefined, body: {
        nodes: entries.map(entry => entry.node),
        nextCursor: result.value.length > page.limit ? Buffer.from(JSON.stringify({ project: r.params.id, parent, prefix, after: entries.at(-1)!.position })).toString('base64url') : null,
      } };
    },
  })];
}
