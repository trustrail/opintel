import type {GroupFilter,MemberFilter,GroupPage,MemberPage} from '../../../shared/api/entitlement-groups.js';
import type {z} from 'zod';
import type {PoolSummary} from '../../../shared/api/pools.js';
import type { EntitlementNode, ViewDefinitionResponse } from '../../../shared/api/entitlement-read.js';
import type { PoolId, Result } from '../../../shared/kernel/index.js';
import type { EntitlementContext } from './entitlement-repository.js';
export type EntitlementTreeRead={parent:string;prefix:string;elementPrefix?:string;undecided:boolean;decided?:boolean;sourceId?:string;after:string|null;limit:number};
export interface EntitlementReader {
 groups(ctx:EntitlementContext,pool:PoolId,q:GroupFilter,after:string|null,limit:number):Promise<Result<z.infer<typeof GroupPage>>>;
 members(ctx:EntitlementContext,pool:PoolId,q:MemberFilter,after:string|null,limit:number):Promise<Result<z.infer<typeof MemberPage>>>;
 pools(ctx:EntitlementContext,after:string|null,limit:number):Promise<Result<PoolSummary[]>>;
 tree(ctx:EntitlementContext,pool:PoolId,query:EntitlementTreeRead):Promise<Result<Array<{node:EntitlementNode;position:string}>>>;
 definition(ctx:EntitlementContext,pool:PoolId):Promise<Result<ViewDefinitionResponse>>;
}
