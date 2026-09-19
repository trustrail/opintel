import { filingListResponseSchema } from '../landing-contract.js';
import type { ProjectId } from '../kernel/index.js';
import { createApiClient } from './client.js';

export function listFilings(projectId: ProjectId, page: { cursor?: string; limit?: number } = {}, client = createApiClient()) {
  const query = new URLSearchParams();
  if (page.cursor) query.set('cursor', page.cursor);
  if (page.limit !== undefined) query.set('limit', String(page.limit));
  return client.request({ path: `/api/v1/projects/${projectId}/filings?${query}`, response: filingListResponseSchema });
}
