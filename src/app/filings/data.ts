import { useQuery } from '@tanstack/react-query';
import { createApiClient, type AppError, type ApiResult } from '../../shared/api/index.js';
import { filingListResponseSchema } from '../../shared/landing-contract.js';
import type { z } from 'zod';
import { projectKeys } from '../tenancy/data.js';

const api = createApiClient();
export type Filing = z.infer<typeof filingListResponseSchema>['items'][number];
export const filingKeys = { list: (projectId: string) => [...projectKeys.scope(projectId), 'filing', 'list'] as const };
export function useFilings(projectId: string) {
  return useQuery<Filing[], AppError>({
    queryKey: filingKeys.list(projectId),
    queryFn: async () => {
      const items: Filing[] = [];
      let cursor: string | null = null;
      do {
        const result: ApiResult<z.infer<typeof filingListResponseSchema>> = await api.request({ path: `/api/v1/projects/${projectId}/filings${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, response: filingListResponseSchema });
        if (!result.ok) throw result.error;
        items.push(...result.value.items);
        cursor = result.value.nextCursor;
      } while (cursor);
      return items.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || b.filingId.localeCompare(a.filingId));
    },
    staleTime: 0, refetchInterval: 30_000, retry: false,
  });
}
