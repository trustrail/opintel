import { withTenant, type Tx } from '../../../platform/db/scope.js';
import type { RunId, SourceId } from '../../../shared/kernel/index.js';
import type { IntrospectionContext } from '../application/introspection-store.js';
import type { IntrospectionCompletedHandler } from '../application/introspection-completed.js';

export async function recordIntrospectionCompleted(tx: Tx, ctx: IntrospectionContext, runId: RunId, sourceId: SourceId): Promise<void> {
  await tx.query(`INSERT INTO introspection_completed(run_id,project_id,source_id,user_id) VALUES($1,$2,$3,$4)`, [runId,ctx.projectId,sourceId,ctx.userId]);
  await tx.query(`INSERT INTO pattern_rule_application(run_id,project_id,pool_id,element_id)
    SELECT $1,$2,b.pool_id,e.id FROM introspection_run r CROSS JOIN LATERAL jsonb_array_elements(r.diff) d
    JOIN catalog_element e ON e.id=(d->>'elementId')::uuid
    JOIN pool_source_binding b ON b.source_id=$3
    WHERE r.id=$1 AND d->>'type'='CatalogElementAdded'`, [runId,ctx.projectId,sourceId]);
}

export async function dispatchIntrospectionCompleted(ctx: IntrospectionContext, handler: IntrospectionCompletedHandler): Promise<void> {
  for (;;) {
    const rows = await withTenant(ctx, tx => tx.query<{runId:RunId;sourceId:SourceId}>(`SELECT run_id AS "runId",source_id AS "sourceId"
      FROM introspection_completed WHERE delivered_at IS NULL ORDER BY run_id LIMIT 100`));
    if (!rows.length) return;
    for (const row of rows) {
      await handler.handle(ctx,{ type:'IntrospectionCompleted',projectId:ctx.projectId,...row });
      await withTenant(ctx,tx=>tx.query('UPDATE introspection_completed SET delivered_at=now() WHERE run_id=$1 AND delivered_at IS NULL', [row.runId]));
    }
  }
}
