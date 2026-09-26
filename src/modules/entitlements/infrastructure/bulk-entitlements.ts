import { createHash } from 'node:crypto';
import { withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok, ElementId, type PoolId, type SourceId, type Result } from '../../../shared/kernel/index.js';
import { BulkStoredResponse, type BulkEntitlementBody } from '../../../shared/api/bulk-entitlements.js';
import { validateTokenDeclarations, validateTokenizedTemporal, type ExposedType, type TemporalDeclarations } from '../../catalog/index.js';
import { validateMaskType } from '../application/mask-compatibility.js';
import { validateCanonicaliserType } from '../application/canonicalisers.js';
import type { BulkEntitlementRepository } from '../application/bulk.js';
import type { EntitlementContext } from '../application/entitlement-repository.js';

type ElementRow = TemporalDeclarations & {
  id: ElementId; sourceId: SourceId; name: string | null; type: ExposedType | null;
  elementStatus: string; objectStatus: string; sourceStatus: string;
  tokenDomain: string | null; caseInsensitive: boolean | null; canonId: string | null;
};
export class PostgresBulkEntitlements implements BulkEntitlementRepository {
  set(ctx: EntitlementContext, pool: PoolId, input: BulkEntitlementBody, key: string, requestId: string): Promise<Result<BulkStoredResponse>> {
    const route = `/api/v1/pools/${pool}/entitlements/bulk`;
    // Fixed property order hashes the validated command, independent of JSON key order.
    const hash = createHash('sha256').update(JSON.stringify({projectId:input.projectId,elementIds:input.elementIds,treatment:input.treatment,maskKind:input.maskKind,justification:input.justification})).digest('hex');
    return withTenant(ctx, async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([ctx.projectId,ctx.userId,route,key])]);
      const [prior] = await tx.query<{body_hash:string;response:unknown}>(`SELECT body_hash,response FROM bulk_entitlement_request
        WHERE actor_id=$1 AND route=$2 AND request_key=$3 AND expires_at>clock_timestamp()`,[ctx.userId,route,key]);
      if (prior) return prior.body_hash === hash ? ok(BulkStoredResponse.parse(prior.response)) : err(new DomainError('idempotency_key_reused','This Idempotency-Key was used with a different bulk decision.'));
      const ids = input.elementIds.map(ElementId);
      // Same source-first order as manual decisions, declarations and introspection.
      // Sorted locks also serialize overlapping batches without reversing lock order.
      await tx.query(`SELECT s.id FROM data_source s WHERE s.id IN
        (SELECT o.source_id FROM catalog_object o JOIN catalog_element e ON e.object_id=o.id WHERE e.id=ANY($1::uuid[])) ORDER BY s.id FOR UPDATE`,[ids]);
      const pools = await tx.query('SELECT id FROM pool WHERE id=$1 FOR SHARE',[pool]);
      if (!pools.length) return err(new DomainError('not_found','The pool was not found in this project.'));
      const bindings = await tx.query<{source_id:SourceId}>('SELECT source_id FROM pool_source_binding WHERE pool_id=$1 ORDER BY source_id FOR SHARE',[pool]);
      const bound = new Set(bindings.map(row=>row.source_id));
      const elements = await tx.query<ElementRow>(`SELECT e.id,o.source_id AS "sourceId",e.exposed_name AS name,e.exposed_type AS type,
        e.status AS "elementStatus",o.status AS "objectStatus",s.status AS "sourceStatus",e.token_domain AS "tokenDomain",e.case_insensitive AS "caseInsensitive",e.canon_id AS "canonId",
        COALESCE(e.source_timezone,d.source_timezone) AS "sourceTimezone",e.epoch_unit AS "epochUnit"
        FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
        LEFT JOIN catalog_schema_temporal d ON d.source_id=o.source_id AND d.schema_name=o.schema_name
        WHERE e.id=ANY($1::uuid[]) ORDER BY e.id FOR UPDATE OF e`,[ids]);
      const byId = new Map(elements.map(row=>[row.id,row]));
      const invalidElements = ids.flatMap(elementId=>{
        const row = byId.get(elementId), reasons: string[] = [];
        if (!row) reasons.push('The element was not found in this project.');
        else {
          if (row.elementStatus !== 'active' || row.objectStatus !== 'active' || row.sourceStatus === 'archived') reasons.push('An active catalogue element and source are required.');
          if (!bound.has(row.sourceId)) reasons.push('The element source is not bound to this pool.');
          // Withholding is valid even for an unsupported or unnameable element.
          if (input.treatment !== 'withheld' && (row.type === null || row.name === null)) reasons.push('The element has no supported exposed type or name.');
          if (input.maskKind !== null) { const valid=validateMaskType(input.maskKind,row.type); if(!valid.ok)reasons.push(valid.error.message); }
          if (input.treatment === 'tokenized') {
            for (const valid of [validateTokenDeclarations(row.type,row,true),validateTokenizedTemporal(row.type,row)]) if(!valid.ok)reasons.push(valid.error.message);
            if (row.canonId === 'stdtime1' && row.type !== null && ['TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT'].includes(row.type) && row.epochUnit === null) reasons.push('Declare epochUnit for the integer timestamp before tokenization.');
            else if (row.canonId !== null) { const valid=validateCanonicaliserType(row.canonId,row.type,row.epochUnit);if(!valid.ok)reasons.push(valid.error.message); }
            if (row.type !== null && !['VARCHAR','UUID','DATE','TIMESTAMP','TIMESTAMPTZ','TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT'].includes(row.type) && !row.type.startsWith('DECIMAL(')) reasons.push(`Type ${row.type} cannot be tokenized; cast it to a supported type upstream.`);
          }
        }
        return reasons.length ? [{elementId,reasons}] : [];
      });
      let response: BulkStoredResponse;
      if (invalidElements.length) {
        return ok({status:422,body:{error:{code:'validation_failed',message:'No entitlements were changed. Correct every invalid element and resubmit the bulk decision.',requestId,retryable:false,details:{invalidElements}}}});
      } else {
        // No decision writes occur until the entire selection has passed validation.
        const [decision] = await tx.query<{id:string;at:Date}>(`INSERT INTO bulk_decision(project_id,actor_id,pool_id,treatment,mask_kind,count,justification)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,occurred_at AS at`,[ctx.projectId,ctx.userId,pool,input.treatment,input.maskKind,ids.length,input.justification]);
        if (!decision) throw new Error('Bulk decision insert returned no row.');
        await tx.query(`INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref,justification,set_at,mask_kind)
          SELECT $1,element_id,$2,$3,'user',$4,$5,$6,$7 FROM unnest($8::uuid[]) AS element_id
          ON CONFLICT(pool_id,element_id) DO UPDATE SET treatment=EXCLUDED.treatment,source_kind=EXCLUDED.source_kind,
          source_ref=EXCLUDED.source_ref,justification=EXCLUDED.justification,set_at=EXCLUDED.set_at,mask_kind=EXCLUDED.mask_kind`,
          [pool,ctx.projectId,input.treatment,ctx.userId,input.justification,decision.at,input.maskKind,ids]);
        response={status:200,body:{decisionId:decision.id,poolId:pool,treatment:input.treatment,count:ids.length,decidedAt:decision.at.toISOString()}};
      }
      // Validation failures return before every write, including request receipts.
      // Successful decisions and their replay response commit together.
      await tx.query(`INSERT INTO bulk_entitlement_request(project_id,actor_id,route,request_key,body_hash,response,expires_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,clock_timestamp()+interval '24 hours')
        ON CONFLICT(project_id,actor_id,route,request_key) DO UPDATE SET body_hash=EXCLUDED.body_hash,response=EXCLUDED.response,expires_at=EXCLUDED.expires_at`,
        [ctx.projectId,ctx.userId,route,key,hash,JSON.stringify(response)]);
      return ok(response);
    });
  }
}
