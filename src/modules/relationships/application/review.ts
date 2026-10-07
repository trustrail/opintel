import type {z} from 'zod';
import type {SuggestionPage,DomainPage,SuggestionAction,AttemptPage} from '../../../shared/api/suggestions.js';
import type {ProjectId,UserId,ElementId,PoolId,Result} from '../../../shared/kernel/index.js';
export type ReviewContext={projectId:ProjectId;userId:UserId};
export interface SuggestionRepository {
 list(ctx:ReviewContext,cursor:string|undefined,limit:number,filter?:{elementId?:ElementId;poolId?:PoolId;view?:'open'|'reviewed'|'all'}):Promise<Result<z.infer<typeof SuggestionPage>>>;
 domains(ctx:ReviewContext,cursor:string|undefined,limit:number):Promise<Result<z.infer<typeof DomainPage>>>;
 attempts(ctx:ReviewContext,id:string,cursor:string|undefined,limit:number):Promise<Result<z.infer<typeof AttemptPage>>>;
 decide(ctx:ReviewContext,id:string,input:z.infer<typeof SuggestionAction>):Promise<Result<void>>;
}
