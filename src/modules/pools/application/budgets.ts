import type {PoolId,Result} from '../../../shared/kernel/index.js';
import type {PoolBudgetValues} from '../../../shared/api/pool-budgets.js';
import type {PoolKeyContext} from './keys.js';
export interface PoolBudgetPort{
 read(ctx:PoolKeyContext,pool:PoolId):Promise<Result<{poolId:PoolId;budgets:PoolBudgetValues}>>;
 change(ctx:PoolKeyContext,pool:PoolId,budgets:PoolBudgetValues):Promise<Result<{poolId:PoolId;budgets:PoolBudgetValues}>>;
}
