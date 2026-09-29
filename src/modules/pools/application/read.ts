import type {PoolId,Result} from '../../../shared/kernel/index.js';
import type {PoolDetail,PoolSummary,AgentTwin} from '../../../shared/api/pools.js';
import type {PoolKeyContext} from './keys.js';
export interface PoolReader {
 list(ctx:PoolKeyContext,after:string|null,limit:number):Promise<Result<PoolSummary[]>>;
 detail(ctx:PoolKeyContext,pool:PoolId):Promise<Result<PoolDetail>>;
 twin(ctx:PoolKeyContext,pool:PoolId,agent:string):Promise<Result<AgentTwin>>;
}
