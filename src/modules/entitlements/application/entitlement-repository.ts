import type { Result, ProjectId, UserId, PoolId, ElementId } from '../../../shared/kernel/index.js';
import type { Entitlement, Treatment } from '../domain/entitlement.js';
export type EntitlementContext = { projectId: ProjectId; userId: UserId };
export interface EntitlementRepository {
 set(ctx: EntitlementContext, decision: Entitlement): Promise<Result<void>>;
 forPool(ctx: EntitlementContext, pool: PoolId): Promise<Result<Map<ElementId, Treatment>>>;
 forElement(ctx: EntitlementContext, pool: PoolId, element: ElementId): Promise<Result<Treatment | null>>;
}
