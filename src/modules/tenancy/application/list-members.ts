import { DomainError, err, ok, type ProjectId, type UserId, type Timestamp, type Result } from '../../../shared/kernel/index.js';

export type ProjectMember = {
  user: { id: UserId; email: string; fullName: string | null };
  projectRole: 'admin' | 'operator' | 'viewer' | null;
  companyRole: 'admin' | 'member' | null;
  via: 'project' | 'company' | 'both';
  grantedAt: Timestamp | null;
  grantedBy: { id: UserId; email: string } | null;
};
export interface MemberListRepository {
  list(project: ProjectId, after: UserId | null, limit: number): Promise<ProjectMember[]>;
}

export class ListMembersService {
  constructor(private readonly repository: MemberListRepository) {}

  async list(project: ProjectId, after: UserId | null, limit: number): Promise<Result<{ items: ProjectMember[]; nextId: UserId | null }, DomainError>> {
    try {
      const candidates = await this.repository.list(project, after, limit + 1);
      const items = candidates.slice(0, limit);
      return ok({ items, nextId: candidates.length > limit ? items.at(-1)?.user.id ?? null : null });
    } catch {
      return err(new DomainError('dependency_unavailable', 'Project members could not be loaded. Please try again.', undefined, true));
    }
  }
}
