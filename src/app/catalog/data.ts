import { projectKeys } from '../tenancy/data.js';
import { catalogPage, type CatalogPage } from '../../shared/api/catalog.js';
export const elementKeys = {
  all: (projectId: string) => [...projectKeys.scope(projectId), 'catalogElement'] as const,
  lists: (projectId: string) => [...elementKeys.all(projectId), 'list'] as const,
  list: (projectId: string, page: CatalogPage) => [...elementKeys.lists(projectId), page] as const,
};
export function catalogOptions(projectId: string, page: CatalogPage) {
  return { queryKey: elementKeys.list(projectId, page), queryFn: async () => {
    const result = await catalogPage(projectId, page);
    if (!result.ok) throw result.error;
    return result.value;
  }, staleTime: 5 * 60_000, retry: false as const };
}
