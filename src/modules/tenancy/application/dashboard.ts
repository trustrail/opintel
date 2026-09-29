import type {ProjectId,UserId,Result} from '../../../shared/kernel/index.js';
import type {DashboardStats,DashboardFinding,PoolShield} from '../../../shared/api/dashboard.js';
export type DashboardContext={projectId:ProjectId;userId:UserId};
export interface DashboardReader{
 stats(ctx:DashboardContext):Promise<Result<DashboardStats>>;
 feed(ctx:DashboardContext,after:string|null,limit:number):Promise<Result<DashboardFinding[]>>;
 pools(ctx:DashboardContext,after:string|null,limit:number):Promise<Result<PoolShield[]>>;
}
