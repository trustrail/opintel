import type {z} from 'zod';
import type {RowDecision,RowDecisionRead,RowDecisionHistory} from '../../../shared/api/row-entitlements.js';
import type {Result,PoolId,ObjectId} from '../../../shared/kernel/index.js';
import type {EntitlementContext} from './entitlement-repository.js';
export interface RowDecisionRepository{
 history(ctx:EntitlementContext,pool:PoolId,object:ObjectId,cursor?:string):Promise<Result<z.infer<typeof RowDecisionHistory>>>;
 read(ctx:EntitlementContext,pool:PoolId,object:ObjectId):Promise<Result<z.infer<typeof RowDecisionRead>>>;
 save(ctx:EntitlementContext,pool:PoolId,object:ObjectId,expression:string):Promise<Result<z.infer<typeof RowDecision>>>;
}
