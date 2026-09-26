import { z } from 'zod';
import { createApiClient } from './client.js';

export const BulkEntitlementBody = z.strictObject({
  projectId: z.uuid(),
  elementIds: z.array(z.uuid()).min(1).refine(ids => new Set(ids).size === ids.length, 'Select each element once.'),
  treatment: z.enum(['clear', 'tokenized', 'masked', 'aggregate_only', 'withheld']),
  maskKind: z.enum(['last4', 'email', 'year', 'all']).nullable().default(null),
  justification: z.string().nullable().default(null),
}).refine(value => (value.treatment === 'masked') === (value.maskKind !== null), {
  message: 'Choose a mask kind exactly when the treatment is masked.', path: ['maskKind'],
}).refine(value => value.treatment !== 'clear' || (value.justification?.trim().length ?? 0) > 0, {
  message: 'A non-empty justification is required for bulk clear.', path: ['justification'],
});
export type BulkEntitlementBody = z.infer<typeof BulkEntitlementBody>;
export const BulkIdempotencyKey = z.string().min(1).refine(value => value.trim().length > 0);
export const BulkEntitlementResponse = z.object({ decisionId: z.uuid(), poolId: z.uuid(), treatment: BulkEntitlementBody.shape.treatment, count: z.number().int().positive(), decidedAt: z.iso.datetime() });
export type BulkEntitlementResponse = z.infer<typeof BulkEntitlementResponse>;
export const BulkInvalidElement = z.object({ elementId: z.uuid(), reasons: z.array(z.string()).min(1) });
export const BulkEntitlementError = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), retryable: z.boolean(), details: z.object({ invalidElements: z.array(BulkInvalidElement) }).optional() }) });
export const BulkStoredResponse = z.discriminatedUnion('status', [
  z.object({status:z.literal(200),body:BulkEntitlementResponse}),
  z.object({status:z.literal(422),body:BulkEntitlementError}),
]);
export type BulkStoredResponse = z.infer<typeof BulkStoredResponse>;
export function bulkSetEntitlements(poolId: string, body: BulkEntitlementBody, idempotencyKey: string, client = createApiClient()) {
  return client.request({ path: `/api/v1/pools/${poolId}/entitlements/bulk`, method:'POST', body, headers:{'Idempotency-Key':idempotencyKey}, response:BulkEntitlementResponse });
}
export function bulkEntitlementOpenApiDocument() {
  return {openapi:'3.1.0',info:{title:'Opintel bulk entitlements',version:'1'},paths:{'/api/v1/pools/{id}/entitlements/bulk':{post:{
    description:'Requires project#set_entitlement. The pool must belong to projectId. All elements are validated before atomic application. No reset treatment exists. Idempotent responses retained for 24 hours.',
    parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'Idempotency-Key',in:'header',required:true,schema:z.toJSONSchema(BulkIdempotencyKey)}],
    requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(BulkEntitlementBody)}}},
    responses:{'200':{description:'All decisions committed',content:{'application/json':{schema:z.toJSONSchema(BulkEntitlementResponse)}}},'422':{description:'No decisions changed; all invalid elements and reasons',content:{'application/json':{schema:z.toJSONSchema(BulkEntitlementError)}}},default:{description:'Error envelope (400 malformed command, 401/403/404 access, 409 idempotency_key_reused)',content:{'application/json':{schema:z.toJSONSchema(BulkEntitlementError)}}}},
  }}}};
}
