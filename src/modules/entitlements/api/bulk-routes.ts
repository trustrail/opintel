import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { BulkEntitlementBody, BulkEntitlementResponse } from '../../../shared/api/bulk-entitlements.js';
import { PoolId, ProjectId } from '../../../shared/kernel/index.js';
import type { BulkEntitlementService } from '../application/bulk.js';
export function bulkEntitlementRoutes(service: BulkEntitlementService) {
  return [defineRoute({method:'POST',path:'/api/v1/pools/:id/entitlements/bulk',params:z.object({id:z.uuid()}),
    request:BulkEntitlementBody,response:z.union([BulkEntitlementResponse,errorEnvelopeSchema]),
    permission:{resource:'project',id:r=>r.body.projectId,permission:'set_entitlement'},
    handle:async r=>{
      const result = await service.execute({projectId:ProjectId(r.body.projectId),userId:r.actor.id},PoolId(r.params.id),r.body,r.headers['idempotency-key'],r.requestId);
      if (!result.ok) {
        if (result.error.code === 'idempotency_key_reused') return {status:409,body:{error:{code:result.error.code,message:result.error.message,requestId:r.requestId,retryable:false}}};
        throw result.error;
      }
      return result.value;
    },
  })];
}
