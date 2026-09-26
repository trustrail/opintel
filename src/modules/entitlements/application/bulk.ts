import { BulkEntitlementBody, BulkIdempotencyKey, type BulkStoredResponse } from '../../../shared/api/bulk-entitlements.js';
import { DomainError, err, type Result, type PoolId } from '../../../shared/kernel/index.js';
import type { EntitlementContext } from './entitlement-repository.js';
export interface BulkEntitlementRepository {
  set(ctx: EntitlementContext, pool: PoolId, input: BulkEntitlementBody, key: string, requestId: string): Promise<Result<BulkStoredResponse>>;
}
export class BulkEntitlementService {
  constructor(private readonly repository: BulkEntitlementRepository) {}
  execute(ctx: EntitlementContext, pool: PoolId, input: unknown, key: unknown, requestId: string): Promise<Result<BulkStoredResponse>> {
    const body = BulkEntitlementBody.safeParse(input), parsedKey = BulkIdempotencyKey.safeParse(key);
    if (!body.success) return Promise.resolve(err(new DomainError('validation_failed', body.error.issues[0]?.message ?? 'Invalid bulk decision.')));
    if (!parsedKey.success) return Promise.resolve(err(new DomainError('validation_failed', 'Idempotency-Key is required for a bulk decision.')));
    if (ctx.projectId !== body.data.projectId) return Promise.resolve(err(new DomainError('forbidden', 'The decision belongs to another project.')));
    return this.repository.set(ctx,pool,body.data,parsedKey.data,requestId);
  }
}
