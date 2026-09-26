import type { Result } from '../../../shared/kernel/index.js';
import type { EntitlementContext } from './entitlement-repository.js';

/** Project-wide invalidation generation. Session cache ownership remains with S2. */
export interface PolicyVersionReader {
  read(ctx: EntitlementContext): Promise<Result<number>>;
}
