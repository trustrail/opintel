import {z} from 'zod';
import {withTenant} from '../../../platform/db/scope.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import {executionRequest,executionSettings} from '../../../shared/execution-contract.js';
import {PostgresEntitlementReader} from '../../entitlements/index.js';
import type {McpPrincipal} from '../application/access.js';
import type {QuerySnapshotReader} from '../application/query-ports.js';
const positive=z.number().int().positive();
const querySettings=z.object({query:z.object({rowLimit:positive,timeoutSeconds:positive,memoryLimitMb:positive,concurrencyPerPool:positive,aggregateMinGroupSize:positive.default(5),...executionSettings.shape})});
const budgets=z.object({rowsPerRequest:positive.optional(),timeoutMs:positive.optional(),memoryMb:positive.optional(),concurrency:positive.optional(),threads:positive});
export class PostgresQueryReader implements QuerySnapshotReader {
 constructor(private readonly requireQueryMode=true) {}
 async read(principal:McpPrincipal){
  const ctx={projectId:principal.pool.projectId,userId:principal.scopeUserId};
  const result=await new PostgresEntitlementReader().compilation(ctx,principal.pool.id);if(!result.ok)return result;
  const [pool]=await withTenant(ctx,tx=>tx.query<{budgets:unknown;enabled:boolean}>('SELECT budgets,mode_query AS enabled FROM pool WHERE id=$1',[principal.pool.id]));
  if(!pool||(this.requireQueryMode&&!pool.enabled))return err(new DomainError('forbidden','Query mode is not enabled for this pool.',{cause:'query_disabled'}));
  const settings=querySettings.safeParse(result.value.projectSettings),budget=budgets.safeParse(pool.budgets);
  if(!settings.success||!budget.success)return err(new DomainError('validation_failed','Configure project query limits and the pool threads budget before querying.',{cause:'invalid_settings',reason:'query_limits'}));
  const q=settings.data.query,b=budget.data;
  const limits=executionRequest.shape.limits.safeParse({memoryMb:Math.min(b.memoryMb??q.memoryLimitMb,q.memoryLimitMb),threads:b.threads,timeoutMs:Math.min(b.timeoutMs??q.timeoutSeconds*1000,q.timeoutSeconds*1000),rowLimit:Math.min(b.rowsPerRequest??q.rowLimit,q.rowLimit),concurrency:Math.min(b.concurrency??q.concurrencyPerPool,q.concurrencyPerPool)});
  if(!limits.success)return err(new DomainError('validation_failed','The configured query limits are invalid.',{cause:'invalid_settings',reason:'query_limits'}));
  return ok({...result.value,aggregateMinGroupSize:q.aggregateMinGroupSize,limits:limits.data,settings:executionSettings.parse({maxStagingRows:q.maxStagingRows,maxQueuedExecutions:q.maxQueuedExecutions})});
 }
}
