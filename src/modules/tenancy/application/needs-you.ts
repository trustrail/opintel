import type {Result,ProjectId,UserId} from '../../../shared/kernel/index.js';
import type {NeedsYouItem} from '../../../shared/api/needs-you.js';
export interface NeedsYouReader {
 read(ctx:{projectId:ProjectId;userId:UserId},admin:boolean,after:string|null,limit:number):Promise<Result<NeedsYouItem[]>>;
}
