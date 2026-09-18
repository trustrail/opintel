import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { createApiClient, type AppError, type ApiResult } from '../../shared/api/index.js';
import { ExplainResponse, ProjectMemberListItem, ProjectMemberListResponse } from '../../shared/api/tenancy-schemas.js';
import { projectKeys } from '../tenancy/data.js';

export type Member = z.infer<typeof ProjectMemberListItem>;
export const memberKeys = {
  list: (projectId: string) => [...projectKeys.scope(projectId), 'members'] as const,
  explanation: (projectId: string, userId: string) => [...projectKeys.scope(projectId), 'permissions', userId, 'explain'] as const,
};
const api = createApiClient();
export function useMembers(projectId: string) {
  return useQuery<Member[], AppError>({
    queryKey: memberKeys.list(projectId), retry: false,
    queryFn: async () => {
      const items: Member[] = [];
      let cursor: string | null = null;
      do {
        const result: ApiResult<z.infer<typeof ProjectMemberListResponse>> = await api.request({
          path: `/api/v1/projects/${projectId}/members${cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`}`,
          response: ProjectMemberListResponse,
        });
        if (!result.ok) throw result.error;
        items.push(...result.value.items);
        cursor = result.value.nextCursor;
      } while (cursor !== null);
      return items;
    },
  });
}
export function usePermissionExplanation(projectId: string, userId: string) {
  return useQuery<z.infer<typeof ExplainResponse>, AppError>({
    queryKey: memberKeys.explanation(projectId, userId), retry: false,
    queryFn: async () => {
      const result = await api.request({ path: `/api/v1/projects/${projectId}/permissions/${userId}/explain`, response: ExplainResponse });
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
}
