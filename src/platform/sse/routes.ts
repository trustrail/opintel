import { z } from 'zod';
import { defineRoute } from '../http/index.js';
import { DomainError, ProjectId } from '../../shared/kernel/index.js';
import { streamEventSchema } from '../../shared/api/stream.js';
import type { ProjectStream } from './port.js';
export function projectStreamRoutes(hub: ProjectStream) {
 return [defineRoute({ method: 'GET', path: '/api/v1/projects/:id/stream', params: z.object({ id: z.string().uuid() }), request: z.undefined(), response: streamEventSchema,
  permission: { resource: 'project', id: r => r.params.id, permission: 'view' },
  handle: r => ({ stream: async (send, signal) => {
   const unsubscribe = await hub.subscribe(ProjectId(r.params.id), send, () => send(null)).catch(() => { throw new DomainError('dependency_unavailable', 'Live updates are temporarily unavailable. Reconnect to refresh this project.', undefined, true); });
   if (signal.aborted) await unsubscribe();
   else signal.addEventListener('abort', () => { void unsubscribe(); }, { once: true });
  } }),
 })];
}
