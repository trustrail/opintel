import type {z} from 'zod';
import {PoolId,ObjectId,type Result} from '../../../shared/kernel/index.js';
import type {BoundPoolTable,PoolTablesPage,PoolTableResult,PoolRowRule,PoolTableSetup} from '../../../shared/api/pool-tables.js';
import type {PoolKeyContext} from './keys.js';
export type PoolTableSelection={tables:readonly ObjectId[];rowRule:PoolRowRule;startingMode:{kind:'nothing_yet'}|{kind:'copy_from';poolId:PoolId}};
export function poolTableSelection(input:PoolTableSetup):PoolTableSelection{return {tables:input.tables.map(ObjectId),rowRule:input.rowRule,startingMode:input.startingMode.kind==='copy_from'?{kind:'copy_from',poolId:PoolId(input.startingMode.poolId)}:{kind:'nothing_yet'}};}
export interface PoolTablesPort{
 list(ctx:PoolKeyContext,pool:PoolId,cursor:string|null,limit:number):Promise<Result<z.infer<typeof PoolTablesPage>>>;
 add(ctx:PoolKeyContext,pool:PoolId,objects:readonly ObjectId[],rule?:PoolRowRule):Promise<Result<z.infer<typeof PoolTableResult>>>;
 remove(ctx:PoolKeyContext,pool:PoolId,object:ObjectId):Promise<Result<void>>;
 rows(ctx:PoolKeyContext,pool:PoolId,object:ObjectId,rule:PoolRowRule):Promise<Result<z.infer<typeof BoundPoolTable>>>;
}
