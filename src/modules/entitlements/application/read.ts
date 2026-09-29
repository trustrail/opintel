import type {PoolSummary} from '../../../shared/api/pools.js';
import type { EntitlementNode, ViewDefinitionResponse } from '../../../shared/api/entitlement-read.js';
import type { PoolId, Result } from '../../../shared/kernel/index.js';
import type { EntitlementContext } from './entitlement-repository.js';
export type EntitlementTreeRead={parent:string;prefix:string;undecided:boolean;sourceId?:string;after:string|null;limit:number};
export interface EntitlementReader {
 pools(ctx:EntitlementContext,after:string|null,limit:number):Promise<Result<PoolSummary[]>>;
 tree(ctx:EntitlementContext,pool:PoolId,query:EntitlementTreeRead):Promise<Result<Array<{node:EntitlementNode;position:string}>>>;
 definition(ctx:EntitlementContext,pool:PoolId):Promise<Result<ViewDefinitionResponse>>;
}
