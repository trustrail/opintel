import { DomainError, err, ok, type ProjectId, type UserId, type Result, type Timestamp } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';

export const projectPermissions = [
  'administer', 'set_entitlement', 'map_term', 'bind_source', 'view_unredacted', 'archive',
  'export_evidence', 'simulate', 'ack_observation', 'view',
] as const;

export type PermissionSubject = {
  user: { id: UserId; email: string };
  projectRole: 'admin' | 'operator' | 'viewer' | null;
  companyRole: 'admin' | 'member' | null;
};
export interface PermissionSubjectRepository {
  read(project: ProjectId, user: UserId): Promise<PermissionSubject | null>;
}
export type ProjectPermissionExplanation = PermissionSubject & {
  permissions: Array<{ permission: string; allowed: boolean; path: string[]; via: 'project' | 'company' | 'none' }>;
  checkedAt: Timestamp;
  token: string;
};

export class ExplainPermissionsService {
  constructor(private readonly repository: PermissionSubjectRepository, private readonly authorization: AuthorizationPort) {}

  async explain(project: ProjectId, user: UserId): Promise<Result<ProjectPermissionExplanation, DomainError>> {
    try {
      const subject = await this.repository.read(project, user);
      if (subject === null) return err(new DomainError('not_found', 'The project or user could not be found.'));
      const checks = await this.authorization.checkMany(projectPermissions.map((permission) => ({
        resource: { type: 'project', id: project }, permission, subject: { type: 'user', id: user },
      })), { withTracing: true });
      const first = checks[0];
      if (first === undefined || checks.length !== projectPermissions.length) throw new Error('Incomplete permission snapshot.');
      const permissions = projectPermissions.map((permission, index) => {
        const check = checks[index];
        if (check === undefined || check.token !== first.token || check.checkedAt !== first.checkedAt || check.snapshotAgeMs !== 0) {
          throw new Error('Inconsistent permission snapshot.');
        }
        const via = !check.allowed ? 'none' : subject.projectRole !== null ? 'project'
          : subject.companyRole === 'admin' ? 'company' : 'none';
        return { permission, allowed: check.allowed, path: check.explanation?.path ?? [], via } as const;
      });
      return ok({ ...subject, permissions, checkedAt: first.checkedAt, token: first.token });
    } catch {
      return err(new DomainError('dependency_unavailable', 'Permissions could not be loaded. Please try again.', undefined, true));
    }
  }
}
