import type { CompanyId, ProjectId, PoolId, Timestamp, UserId } from '../../../shared/kernel/index.js';

export type AuthorizationRevision = string & { readonly __brand: 'AuthorizationRevision' };

export type CheckRequest = {
  resource: { type: 'company' | 'project' | 'pool' | 'datasource'; id: string };
  permission: string;
  subject: { type: 'user' | 'pool'; id: string };
};

export type PermissionTrace = { path: string[] };

export type CheckResult = {
  allowed: boolean;
  checkedAt: Timestamp;
  token: AuthorizationRevision;
  snapshotAgeMs: number;
  explanation?: PermissionTrace;
};

export type RelationshipUpdate = {
  operation: 'touch' | 'delete';
  resource: CheckRequest['resource'];
  relation: string;
  subject:
    | { type: 'user'; id: UserId }
    | { type: 'project'; id: ProjectId }
    | { type: 'pool'; id: PoolId }
    | { type: 'company'; id: CompanyId };
};

export interface AuthorizationPort {
  check(request: CheckRequest): Promise<CheckResult>;
  checkMany(requests: CheckRequest[], options?: { withTracing: boolean }): Promise<CheckResult[]>;
  write(updates: RelationshipUpdate[]): Promise<AuthorizationRevision>;
  explain(request: CheckRequest): Promise<{ allowed: boolean; path: string[] }>;
}
