import type {z} from 'zod';
import type {RowDecision,RowDecisionRead,RowDecisionHistory,PoolRowObjects,PoolRowFilter} from '../../../shared/api/row-entitlements.js';
import type {Result,PoolId,ObjectId} from '../../../shared/kernel/index.js';
import type {EntitlementContext} from './entitlement-repository.js';
export interface RowDecisionRepository{
 decision(ctx:EntitlementContext,id:string):Promise<Result<z.infer<typeof RowDecision>>>;
 objects(ctx:EntitlementContext,pool:PoolId,filter:PoolRowFilter):Promise<Result<z.infer<typeof PoolRowObjects>>>;
 history(ctx:EntitlementContext,pool:PoolId,object:ObjectId,cursor?:string):Promise<Result<z.infer<typeof RowDecisionHistory>>>;
 read(ctx:EntitlementContext,pool:PoolId,object:ObjectId):Promise<Result<z.infer<typeof RowDecisionRead>>>;
 save(ctx:EntitlementContext,pool:PoolId,object:ObjectId,expression:string,level?:'object_default'|'pool_override'):Promise<Result<z.infer<typeof RowDecision>>>;
}
