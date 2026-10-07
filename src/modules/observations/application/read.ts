import type {z} from 'zod';
import type {ProjectId,UserId,Result} from '../../../shared/kernel/index.js';
import type {ObservationPage,ObservationMemberPage} from '../../../shared/api/observations.js';
export type ObservationContext={projectId:ProjectId;userId:UserId};
export type ObservationScope={view:'open'|'resolved';custody:boolean};
export interface ObservationReader {
 groups(ctx:ObservationContext,scope:ObservationScope,after:string|null,limit:number):Promise<Result<z.infer<typeof ObservationPage>>>;
 members(ctx:ObservationContext,scope:ObservationScope,group:string,after:string|null,limit:number):Promise<Result<z.infer<typeof ObservationMemberPage>>>;
}
