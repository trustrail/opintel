import {withTenant} from '../../../platform/db/scope.js';
import {TypeObservation} from '../../../shared/api/type-observations.js';
import type {TypeObservations} from '../application/type-observations.js';
/** Run findings are durable; current observations close on repair or removal. */
export class PostgresTypeObservations implements TypeObservations {
 list(...[ctx,after,limit]:Parameters<TypeObservations['list']>){
  return withTenant(ctx,async tx=>{
   const rows=await tx.query<TypeObservation & {observedAt:string}>(`SELECT s.id AS "sourceId",s.name AS "sourceName",r.d->>'sourceType' AS "sourceType",
    (array_agg(r.id ORDER BY r.ended_at DESC,r.id DESC))[1] AS "runId",count(DISTINCT e.id)::int AS "elementCount",max(r.ended_at)::text AS "observedAt"
    FROM data_source s
    JOIN LATERAL (SELECT DISTINCT ON (d->>'elementId') id,ended_at,d FROM introspection_run
      CROSS JOIN LATERAL jsonb_array_elements(diff) d
      WHERE source_id=s.id AND state='complete' AND d->>'type'='CatalogElementUnsupported'
      ORDER BY d->>'elementId',created_at DESC,id DESC) r ON true
    JOIN catalog_element e ON e.id=(r.d->>'elementId')::uuid AND e.source_type=r.d->>'sourceType' AND e.status='active' AND e.exposed_type IS NULL
    JOIN catalog_object o ON o.id=e.object_id AND o.source_id=s.id AND o.status='active'
    WHERE s.status<>'archived' AND r.d->>'type'='CatalogElementUnsupported' AND r.d->>'unsupportedReason'='unmapped'
    AND ($1::uuid IS NULL OR s.id>$1 OR (s.id=$1 AND (r.d->>'sourceType') COLLATE "C">$2 COLLATE "C"))
    GROUP BY s.id,s.name,r.d->>'sourceType'
    ORDER BY s.id,(r.d->>'sourceType') COLLATE "C" LIMIT $3`,[after?.sourceId??null,after?.sourceType??null,limit]);
   return rows.map(row=>TypeObservation.parse({...row,observedAt:new Date(row.observedAt).toISOString()}));
  });
 }
}
