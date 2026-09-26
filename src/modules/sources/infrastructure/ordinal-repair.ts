import { withPlatform, withTenant } from '../../../platform/db/scope.js';
import { type IdFactory, type ProjectId, type UserId, type RunId, type SourceId } from '../../../shared/kernel/index.js';
import type { SourceContext } from '../application/source-registration.js';

/** One startup pass. Project discovery is platform scope; all catalogue reads
 * and queued work stay in tenant scope. Source locks make repeated starts safe. */
export class PostgresOrdinalRepair {
  constructor(private readonly ids: IdFactory) {}
  async queue(): Promise<SourceContext[]> {
    const projects = await withPlatform(tx => tx.query<{ projectId: ProjectId; userId: UserId | null }>(`
      SELECT p.id AS "projectId", COALESCE(
        (SELECT user_id FROM project_member WHERE project_id=p.id AND role='admin' ORDER BY user_id LIMIT 1),
        (SELECT user_id FROM company_member WHERE company_id=p.company_id AND role='admin' ORDER BY user_id LIMIT 1)
      ) AS "userId" FROM project p`));
    const work: SourceContext[] = [];
    for (const project of projects) {
      if (project.userId === null) {
        console.warn({event:'catalog.ordinal_repair_unavailable',projectId:project.projectId,category:'no_administrator'});
        continue;
      }
      const ctx = { projectId: project.projectId, userId: project.userId };
      const pending = await withTenant(ctx, async tx => {
        const sources = await tx.query<{id:SourceId}>(`SELECT s.id FROM data_source s WHERE s.status<>'archived' AND EXISTS (
          SELECT 1 FROM catalog_object o JOIN catalog_element e ON e.object_id=o.id
          WHERE o.source_id=s.id AND o.status='active' AND e.status='active' AND e.ordinal IS NULL
        ) ORDER BY s.id FOR UPDATE OF s`);
        for (const source of sources) {
          const active = await tx.query("SELECT id FROM introspection_run WHERE source_id=$1 AND state IN ('queued','connecting','reading','diffing')", [source.id]);
          if (active.length) continue;
          // Cover every schema containing an unknown ordinal, even when the
          // most recent user-triggered run selected only a subset of schemas.
          const schemas = await tx.query<{schema_name:string}>(`SELECT DISTINCT o.schema_name FROM catalog_object o
            JOIN catalog_element e ON e.object_id=o.id WHERE o.source_id=$1 AND o.status='active' AND e.status='active' AND e.ordinal IS NULL ORDER BY o.schema_name`, [source.id]);
          await tx.query(`INSERT INTO introspection_run(id,source_id,project_id,include_schemas,progress) VALUES($1,$2,$3,$4,$5::jsonb)`,
            [this.ids.create<RunId>(),source.id,ctx.projectId,schemas.map(row=>row.schema_name),JSON.stringify({phase:'queued',userId:ctx.userId,ordinalRepair:true})]);
        }
        return sources.length > 0;
      });
      if (pending) work.push(ctx);
    }
    return work;
  }
}
