import type {Result,PoolId,ObjectId} from '../../../shared/kernel/index.js';
import type {RowPreviewRequest,RowPreviewResponse} from '../../../shared/row-preview-contract.js';
import type {EntitlementContext} from './entitlement-repository.js';
export interface RowPreviewEngine {preview(input:RowPreviewRequest,signal?:AbortSignal,ctx?:EntitlementContext):Promise<Result<RowPreviewResponse>>}
export interface RowPreview {run(ctx:EntitlementContext,pool:PoolId,object:ObjectId,expression:string,level:'object_default'|'pool_override'):Promise<Result<RowPreviewResponse>>}
