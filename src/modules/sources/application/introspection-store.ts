import type { ProjectId, UserId, SourceId, RunId, Result, Timestamp, ErrorCode } from '../../../shared/kernel/index.js';
import type { CatalogSnapshot, SourceKind } from './source-connector.js';
import type { IntrospectionState } from '../domain/introspection-run.js';
import type { IntrospectionDiff } from '../../catalog/index.js';
import type { VaultRef } from '../../../platform/vault/types.js';
export type IntrospectionContext = { projectId: ProjectId; userId: UserId };
export type SourceStatus = 'pending' | 'testing' | 'connected' | 'unreachable' | 'archived';
export type IntrospectionSource = { id: SourceId; projectId: ProjectId; kind: SourceKind; credentialRef: VaultRef; status: SourceStatus; receivesLandings?: boolean; landingStrategy?: string | null };
export type IntrospectionRun = { id: RunId; sourceId: SourceId; state: IntrospectionState; adoptRenamedNames: boolean; include: string[]; diff: IntrospectionDiff[]; error: string | null; errorCode?: ErrorCode | null; startedAt: Timestamp | null; endedAt: Timestamp | null };
export interface IntrospectionStore {
  enqueue(ctx: IntrospectionContext, sourceId: SourceId, include: string[], adoptRenamedNames?: boolean): Promise<Result<IntrospectionRun>>;
  read(ctx: IntrospectionContext, id: RunId): Promise<Result<IntrospectionRun>>;
  source(ctx: IntrospectionContext, id: SourceId): Promise<Result<IntrospectionSource>>;
  advance(ctx: IntrospectionContext, id: RunId, from: IntrospectionState, to: IntrospectionState): Promise<Result<IntrospectionRun>>;
  cancel(ctx: IntrospectionContext, id: RunId): Promise<Result<IntrospectionRun>>;
  fail(ctx: IntrospectionContext, id: RunId, reason: string, unreachable: boolean, code?: ErrorCode): Promise<Result<IntrospectionRun>>;
  publish(ctx: IntrospectionContext, id: RunId, snapshot: CatalogSnapshot): Promise<Result<IntrospectionRun>>;
}
