import { DomainError, err, ok, type CompanyId, type IndustryId, type ProjectId, type Region, type Result, type Timestamp, type UserId } from '../../../shared/kernel/index.js';
import type { AuthorizationPort, CheckRequest } from '../../authz/index.js';

export type ProjectCandidate = {
  id: ProjectId; name: string; region: Region; archivedAt: Timestamp | null;
  company: { id: CompanyId; name: string };
  industry: { id: IndustryId; name: string };
};
export type CompanyCandidate = { id: CompanyId; name: string };
export type ProjectListEntry = ProjectCandidate & { role: 'admin' | 'operator' | 'viewer' };
export type CompanyListEntry = CompanyCandidate & { role: 'admin' | 'member'; projectCount: number };
export type ListPage<T> = { items: T[]; nextId: string | null };

export interface TenancyListRepository {
  projects(user: UserId, after: string | null, limit: number, includeArchived: boolean, company?: CompanyId): Promise<ProjectCandidate[]>;
  companies(user: UserId, after: string | null, limit: number): Promise<CompanyCandidate[]>;
}

const batchSize = 100;

export class TenancyListService {
  constructor(private readonly repository: TenancyListRepository, private readonly authorization: AuthorizationPort) {}

  async projects(user: UserId, after: string | null, limit: number, includeArchived: boolean): Promise<Result<ListPage<ProjectListEntry>, DomainError>> {
    try {
      return ok(await this.page(after, limit,
        (cursor) => this.repository.projects(user, cursor, batchSize, includeArchived),
        async (candidates) => {
          const permissions = ['view', 'administer', 'simulate'];
          const allowed = await this.check(user, candidates.flatMap((project) => permissions.map((permission) => ({
            resource: { type: 'project' as const, id: project.id }, permission,
          }))));
          return candidates.flatMap((project, index): ProjectListEntry[] => {
            if (!allowed[index * 3]) return [];
            const role = allowed[index * 3 + 1] ? 'admin' : allowed[index * 3 + 2] ? 'operator' : 'viewer';
            return [{ ...project, role }];
          });
        },
      ));
    } catch {
      return this.unavailable();
    }
  }

  async companies(user: UserId, after: string | null, limit: number): Promise<Result<ListPage<CompanyListEntry>, DomainError>> {
    try {
      return ok(await this.page(after, limit,
        (cursor) => this.repository.companies(user, cursor, batchSize),
        async (candidates) => {
          const allowed = await this.check(user, candidates.flatMap((company) => ['view', 'administer'].map((permission) => ({
            resource: { type: 'company' as const, id: company.id }, permission,
          }))));
          const items: CompanyListEntry[] = [];
          for (const [index, company] of candidates.entries()) {
            const projectCount = await this.reachableProjectCount(user, company.id);
            if (!allowed[index * 2] && projectCount === 0) continue;
            items.push({ ...company, role: allowed[index * 2 + 1] ? 'admin' : 'member', projectCount });
          }
          return items;
        },
      ));
    } catch {
      return this.unavailable();
    }
  }

  private async reachableProjectCount(user: UserId, company: CompanyId): Promise<number> {
    let after: string | null = null;
    let count = 0;
    while (true) {
      const projects = await this.repository.projects(user, after, batchSize, true, company);
      const allowed = await this.check(user, projects.map((project) => ({ resource: { type: 'project', id: project.id }, permission: 'view' })));
      count += allowed.filter(Boolean).length;
      const last = projects.at(-1);
      if (projects.length < batchSize || last === undefined) return count;
      after = last.id;
    }
  }

  private async check(user: UserId, requests: Array<Omit<CheckRequest, 'subject'>>): Promise<boolean[]> {
    if (requests.length === 0) return [];
    const results = await this.authorization.checkMany(requests.map((request) => ({ ...request, subject: { type: 'user', id: user } })));
    if (results.length !== requests.length) throw new Error('Incomplete authorization results.');
    return results.map((result) => result.allowed);
  }

  private async page<C extends { id: string }, T extends { id: string }>(
    after: string | null, limit: number,
    read: (cursor: string | null) => Promise<C[]>,
    visible: (candidates: C[]) => Promise<T[]>,
  ): Promise<ListPage<T>> {
    const items: T[] = [];
    let cursor = after;
    while (items.length <= limit) {
      const candidates = await read(cursor);
      items.push(...await visible(candidates));
      const last = candidates.at(-1);
      if (candidates.length < batchSize || last === undefined) break;
      cursor = last.id;
    }
    const pageItems = items.slice(0, limit);
    return { items: pageItems, nextId: items.length > limit ? pageItems.at(-1)?.id ?? null : null };
  }

  private unavailable(): Result<never, DomainError> {
    return err(new DomainError('dependency_unavailable', 'The list could not be loaded. Please try again.', undefined, true));
  }
}
