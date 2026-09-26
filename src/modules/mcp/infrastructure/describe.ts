import { withTenant } from '../../../platform/db/scope.js';
import { ok, type PoolId } from '../../../shared/kernel/index.js';
import type { PoolKeyContext } from '../../pools/index.js';
import type { DescribeReader, DescribeDecision } from '../application/describe.js';

export class PostgresDescribeReader implements DescribeReader {
 read(ctx: PoolKeyContext, pool: PoolId, object?: string) {
  return withTenant(ctx,async tx=>ok(await tx.query<DescribeDecision>(`
   SELECT s.id AS "sourceId",s.exposed_alias||'.'||o.exposed_schema||'.'||o.exposed_name AS object,
    e.exposed_name AS name,e.exposed_type AS "exposedType",t.treatment
   FROM entitlement t
   JOIN catalog_element e ON e.id=t.element_id AND e.project_id=t.project_id
   JOIN catalog_object o ON o.id=e.object_id AND o.project_id=e.project_id
   JOIN data_source s ON s.id=o.source_id AND s.project_id=o.project_id
   JOIN pool_source_binding b ON b.pool_id=t.pool_id AND b.source_id=s.id AND b.project_id=t.project_id
   WHERE t.pool_id=$1 AND e.status='active' AND o.status='active' AND s.status<>'archived'
    AND e.exposed_name IS NOT NULL AND e.exposed_type IS NOT NULL
    AND ($2::text IS NULL OR s.exposed_alias||'.'||o.exposed_schema||'.'||o.exposed_name=$2)
   ORDER BY s.exposed_alias COLLATE "C",o.exposed_schema COLLATE "C",o.exposed_name COLLATE "C",e.ordinal NULLS LAST,e.exposed_name COLLATE "C"
  `,[pool,object??null])));
 }
}
