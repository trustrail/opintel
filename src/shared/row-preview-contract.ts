import {z} from 'zod';
import {executionRequest} from './execution-contract.js';
export const rowPreviewRequest=executionRequest.extend({orderBy:z.array(z.string().min(1).refine(v=>!v.includes('\0'))).min(1)});
export type RowPreviewRequest=z.infer<typeof rowPreviewRequest>;
export const rowPreviewResponse=z.strictObject({total:z.number().int().nonnegative().safe(),entitled:z.number().int().nonnegative().safe().nullable(),belowThreshold:z.boolean(),columns:z.array(z.string()),rows:z.array(z.array(z.unknown())).max(5),aggregateColumns:z.array(z.string()),custodyColumns:z.array(z.string()),receiptId:z.string()});
export type RowPreviewResponse=z.infer<typeof rowPreviewResponse>;
