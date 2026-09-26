import type { ProjectId, UserId, SourceId, RunId, PoolId, Result, Timestamp, ErrorCode } from '../../../shared/kernel/index.js';
import type { CatalogSnapshot, SourceKind } from './source-connector.js';
import type { IntrospectionState } from '../domain/introspection-run.js';
import type { IntrospectionDiff } from '../../catalog/index.js';
import type { Treatment, MaskKind } from '../../entitlements/index.js';
import type { SecretRef } from '../../../platform/secrets/types.js';
export type IntrospectionContext = { projectId: ProjectId; userId: UserId };
export type SourceStatus = 'pending' | 'testing' | 'connected' | 'unreachable' | 'archived';
export type IntrospectionSource = { id: SourceId; projectId: ProjectId; kind: SourceKind; credentialRef: SecretRef; status: SourceStatus; receivesLandings?: boolean; landingStrategy?: string | null };
export type RecordedIntrospectionDiff = IntrospectionDiff & { runId?: RunId; entitlements?: Array<{poolId:PoolId;treatment:Treatment;maskKind?:MaskKind|null}> };
export type IntrospectionRun = { id: RunId; sourceId: SourceId; state: IntrospectionState; adoptRenamedNames: boolean; include: string[]; diff: RecordedIntrospectionDiff[]; error: string | null; errorCode?: ErrorCode | null; startedAt: Timestamp | null; endedAt: Timestamp | null };
export interface IntrospectionStore {
  dispatchCompleted?(ctx: IntrospectionContext): Promise<void>;
  enqueue(ctx: IntrospectionContext, sourceId: SourceId, include: string[], adoptRenamedNames?: boolean): Promise<Result<IntrospectionRun>>;
  read(ctx: IntrospectionContext, id: RunId): Promise<Result<IntrospectionRun>>;
  source(ctx: IntrospectionContext, id: SourceId): Promise<Result<IntrospectionSource>>;
  advance(ctx: IntrospectionContext, id: RunId, from: IntrospectionState, to: IntrospectionState): Promise<Result<IntrospectionRun>>;
  cancel(ctx: IntrospectionContext, id: RunId, requireCancellable?: boolean): Promise<Result<IntrospectionRun>>;
  fail(ctx: IntrospectionContext, id: RunId, reason: string, unreachable: boolean, code?: ErrorCode): Promise<Result<IntrospectionRun>>;
  publish(ctx: IntrospectionContext, id: RunId, snapshot: CatalogSnapshot): Promise<Result<IntrospectionRun>>;
}
