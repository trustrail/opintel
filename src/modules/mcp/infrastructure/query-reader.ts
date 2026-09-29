import {projectSettingSchema,readSetting} from '../../../shared/project-settings.js';
import {z} from 'zod';
import {withTenant} from '../../../platform/db/scope.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import {executionRequest,executionSettings} from '../../../shared/execution-contract.js';
import {PostgresEntitlementReader} from '../../entitlements/index.js';
import type {McpPrincipal} from '../application/access.js';
import type {QuerySnapshotReader} from '../application/query-ports.js';
const positive=z.number().int().positive();
const querySettings=z.object({query:z.object({rowLimit:projectSettingSchema('query.rowLimit'),timeoutSeconds:projectSettingSchema('query.timeoutSeconds'),memoryLimitMb:projectSettingSchema('query.memoryLimitMb'),concurrencyPerPool:projectSettingSchema('query.concurrencyPerPool'),aggregateMinGroupSize:projectSettingSchema('query.aggregateMinGroupSize'),...executionSettings.shape})});
const budgets=z.object({rowsPerRequest:positive.optional(),timeoutMs:positive.optional(),memoryMb:positive.optional(),concurrency:positive.optional(),threads:positive});
export class PostgresQueryReader implements QuerySnapshotReader {
 constructor(private readonly requireQueryMode=true) {}
 async read(principal:McpPrincipal){
  const ctx={projectId:principal.pool.projectId,userId:principal.scopeUserId};
  const result=await new PostgresEntitlementReader().compilation(ctx,principal.pool.id);if(!result.ok)return result;
  const [pool]=await withTenant(ctx,tx=>tx.query<{budgets:unknown;enabled:boolean}>('SELECT budgets,mode_query AS enabled FROM pool WHERE id=$1',[principal.pool.id]));
  if(!pool||(this.requireQueryMode&&!pool.enabled))return err(new DomainError('forbidden','Query mode is not enabled for this pool.',{cause:'query_disabled'}));
  const settings=querySettings.safeParse(result.value.projectSettings),budget=budgets.safeParse(pool.budgets);
  if(!this.requireQueryMode){
   const missing:string[]=[],invalid:string[]=[];
   for(const name of ['timeoutSeconds','rowLimit','memoryLimitMb','concurrencyPerPool']){
    const value=readSetting(result.value.projectSettings,'query.'+name);
    if(value===undefined)missing.push('query.'+name);
    else if(!projectSettingSchema('query.'+name).safeParse(value).success)invalid.push('query.'+name);
   }
   const threads=readSetting(pool.budgets,'threads');
   if(threads===undefined)missing.push('pool.budgets.threads');
   else if(!positive.safeParse(threads).success)invalid.push('pool.budgets.threads');
   const executionNotes:string[]=[];
   if(missing.length)executionNotes.push(`Execution would be refused until these limits are configured: ${missing.join(', ')}.`);
   if(invalid.length)executionNotes.push(`Execution would be refused because these limits are invalid: ${invalid.join(', ')}.`);
   if(!missing.length&&!invalid.length&&(!settings.success||!budget.success))executionNotes.push('Execution would be refused because project query settings or pool budgets are invalid.');
   return ok({...result.value,aggregateMinGroupSize:Number(projectSettingSchema('query.aggregateMinGroupSize').parse(readSetting(result.value.projectSettings,'query.aggregateMinGroupSize'))),settings:executionSettings.parse({}),executionNotes});
  }
  if(!settings.success||!budget.success)return err(new DomainError('validation_failed','Configure project query limits and the pool threads budget before querying.',{cause:'invalid_settings',reason:'query_limits'}));
  const q=settings.data.query,b=budget.data;
  const limits=executionRequest.shape.limits.safeParse({memoryMb:Math.min(b.memoryMb??Number(q.memoryLimitMb),Number(q.memoryLimitMb)),threads:b.threads,timeoutMs:Math.min(b.timeoutMs??Number(q.timeoutSeconds)*1000,Number(q.timeoutSeconds)*1000),rowLimit:Math.min(b.rowsPerRequest??Number(q.rowLimit),Number(q.rowLimit)),concurrency:Math.min(b.concurrency??Number(q.concurrencyPerPool),Number(q.concurrencyPerPool))});
  if(!limits.success)return err(new DomainError('validation_failed','The configured query limits are invalid.',{cause:'invalid_settings',reason:'query_limits'}));
  return ok({...result.value,aggregateMinGroupSize:Number(q.aggregateMinGroupSize),limits:limits.data,settings:executionSettings.parse({maxStagingRows:q.maxStagingRows,maxQueuedExecutions:q.maxQueuedExecutions})});
 }
}
