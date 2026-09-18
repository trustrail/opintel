import type { CompanyId, PoolId, Timestamp, UserId } from '../../../shared/kernel/index.js';

export type ZedToken = string & { readonly __brand: 'ZedToken' };

export type CheckRequest = {
  resource: { type: 'company' | 'project' | 'pool' | 'datasource'; id: string };
  permission: string;
  subject: { type: 'user' | 'pool'; id: string };
};

export type PermissionTrace = { path: string[] };

export type CheckResult = {
  allowed: boolean;
  checkedAt: Timestamp;
  token: ZedToken;
  snapshotAgeMs: number;
  explanation?: PermissionTrace;
};

export type RelationshipUpdate = {
  operation: 'touch' | 'delete';
  resource: CheckRequest['resource'];
  relation: string;
  subject:
    | { type: 'user'; id: UserId }
    | { type: 'pool'; id: PoolId }
    | { type: 'company'; id: CompanyId };
};

export interface AuthorizationPort {
  check(request: CheckRequest): Promise<CheckResult>;
  checkMany(requests: CheckRequest[], options?: { withTracing: boolean }): Promise<CheckResult[]>;
  write(updates: RelationshipUpdate[]): Promise<ZedToken>;
  explain(request: CheckRequest): Promise<{ allowed: boolean; path: string[] }>;
}
