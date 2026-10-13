import type {z} from 'zod';
import type {ColumnTags} from '../../../shared/api/column-tags.js';
import type {Result,ProjectId,UserId,ElementId} from '../../../shared/kernel/index.js';
export interface ColumnTagRepository{
 read(ctx:{projectId:ProjectId;userId:UserId},id:ElementId):Promise<Result<z.infer<typeof ColumnTags>>>;
 save(ctx:{projectId:ProjectId;userId:UserId},id:ElementId,tags:Record<string,string>):Promise<Result<z.infer<typeof ColumnTags>>>;
}
