import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createApiClient, type AppError, type ApiRequest } from '../../shared/api/index.js';
import { CompanyListResponse, CompanyView, CreateCompanyBody, CreateProjectBody, IndustryListResponse, ProjectListResponse, ProjectView } from '../../shared/api/tenancy-schemas.js';
import { authKeys } from '../guard.js';

export const projectKeys = {
  lists: () => ['project', 'list'] as const,
  scope: (id: string) => ['project', id] as const,
  detail: (id: string) => ['project', id, 'detail'] as const,
};
export const companyKeys = { lists: () => ['company', 'list'] as const };
export const industryKeys = { lists: () => ['industry', 'list'] as const };
export type ProjectItem = z.infer<typeof ProjectListResponse>['items'][number];
export type IndustryItem = z.infer<typeof IndustryListResponse>[number];
export type NewProject = z.infer<typeof CreateProjectBody>;
export type NewCompany = z.infer<typeof CreateCompanyBody>;
const api = createApiClient();

async function request<T>(options: ApiRequest<T>): Promise<T> {
  const result = await api.request(options);
  if (!result.ok) throw result.error;
  return result.value;
}

async function pages<T>(path: string, response: z.ZodType<{ items: T[]; nextCursor: string | null }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: T[]; nextCursor: string | null } = await request({
      path: `${path}${cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`}`, response,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return items;
}

export function useProjects() {
  return useQuery<ProjectItem[], AppError>({ queryKey: projectKeys.lists(), queryFn: () => pages('/api/v1/projects', ProjectListResponse), retry: false });
}
export function useCompanies() {
  return useQuery<z.infer<typeof CompanyListResponse>['items'], AppError>({ queryKey: companyKeys.lists(), queryFn: () => pages('/api/v1/companies', CompanyListResponse), retry: false });
}
export function useIndustries() {
  return useQuery<IndustryItem[], AppError>({ queryKey: industryKeys.lists(), queryFn: () => request({ path: '/api/v1/industries', response: IndustryListResponse }), staleTime: 3_600_000, retry: false });
}
export function useCreateProject() {
  const cache = useQueryClient();
  return useMutation<z.infer<typeof ProjectView>, AppError, NewProject>({
    mutationFn: (body) => request({ path: '/api/v1/projects', method: 'POST', body, response: ProjectView }),
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: projectKeys.lists() }), cache.invalidateQueries({ queryKey: companyKeys.lists() })]);
    },
  });
}
export function useCreateCompany() {
  const cache = useQueryClient();
  return useMutation<z.infer<typeof CompanyView>, AppError, NewCompany>({
    mutationFn: (body) => request({ path: '/api/v1/companies', method: 'POST', body, response: CompanyView }),
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: companyKeys.lists() }), cache.invalidateQueries({ queryKey: authKeys.currentUser() })]);
    },
  });
}
