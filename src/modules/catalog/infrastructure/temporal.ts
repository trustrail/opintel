import { withPlatform, withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok, type ElementId, type SourceId } from '../../../shared/kernel/index.js';
import { temporalPatch, schemaTimezonePatch, validateTemporalType, validateTokenizedTemporal, type TemporalContext, type TemporalRepository, type TemporalView } from '../application/temporal.js';
import type { DuckDbType } from '../domain/type-mapping.js';

type Row = TemporalView & { duckdbType: DuckDbType | null; tokenized: boolean };
const select = `SELECT e.source_timezone AS "sourceTimezone", e.epoch_unit AS "epochUnit",
 d.source_timezone AS "schemaTimezone", COALESCE(e.source_timezone,d.source_timezone) AS "effectiveSourceTimezone",
 e.duckdb_type AS "duckdbType", EXISTS(SELECT 1 FROM entitlement t WHERE t.element_id=e.id AND t.treatment='tokenized') AS tokenized
 FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id
 LEFT JOIN catalog_schema_temporal d ON d.source_id=o.source_id AND d.schema_name=o.schema_name`;
const view = (row: Row): TemporalView => ({ sourceTimezone: row.sourceTimezone, epochUnit: row.epochUnit, schemaTimezone: row.schemaTimezone, effectiveSourceTimezone: row.effectiveSourceTimezone });
const missing = () => err(new DomainError('not_found', 'The catalogue element or schema was not found in this project.'));
const confirmationRequired = () => err(new DomainError('conflict', 'Changing a declaration used by a tokenized entitlement changes its tokens. Type the project name exactly to confirm.'));
async function confirmed(ctx: TemporalContext, confirmation: string | undefined) {
  const [project] = await withPlatform(tx => tx.query<{ name: string }>('SELECT name FROM project WHERE id=$1', [ctx.projectId]));
  return confirmation !== undefined && project?.name === confirmation;
}
export class PostgresTemporalRepository implements TemporalRepository {
  read(ctx: TemporalContext, element: ElementId) {
    return withTenant(ctx, async tx => {
      const [row] = await tx.query<Row>(select + ' WHERE e.id=$1', [element]);
      return row ? ok(view(row)) : missing();
    });
  }
  setElement(ctx: TemporalContext, element: ElementId, input: unknown) {
    const parsed = temporalPatch.safeParse(input);
    if (!parsed.success) return Promise.resolve(err(new DomainError('validation_failed', 'Declare sourceTimezone as a valid IANA zone and epochUnit as seconds or milliseconds.')));
    const patch = parsed.data;
    return withTenant(ctx, async tx => {
      // Entitlement writes, introspection and schema changes use the same source
      // lock. Declaration validation and its write cannot race a decision.
      const rows = await tx.query('SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id JOIN catalog_element e ON e.object_id=o.id WHERE e.id=$1 FOR UPDATE OF s', [element]);
      if (!rows.length) return missing();
      const [row] = await tx.query<Row>(select + ' WHERE e.id=$1 FOR UPDATE OF e', [element]);
      if (!row) return missing();
      const next = { sourceTimezone: patch.sourceTimezone === undefined ? row.sourceTimezone : patch.sourceTimezone, epochUnit: patch.epochUnit === undefined ? row.epochUnit : patch.epochUnit };
      const valid = validateTemporalType(row.duckdbType, next);
      if (!valid.ok) return valid;
      const effective = next.sourceTimezone ?? row.schemaTimezone;
      const changing = (row.sourceTimezone !== null && next.sourceTimezone !== row.sourceTimezone)
        || (row.effectiveSourceTimezone !== null && effective !== row.effectiveSourceTimezone)
        || (row.epochUnit !== null && next.epochUnit !== row.epochUnit);
      if (row.tokenized && changing && !await confirmed(ctx, patch.confirmation)) return confirmationRequired();
      if (row.tokenized) {
        const validDecision = validateTokenizedTemporal(row.duckdbType, { ...next, sourceTimezone: effective });
        if (!validDecision.ok) return validDecision;
      }
      await tx.query('UPDATE catalog_element SET source_timezone=$2,epoch_unit=$3 WHERE id=$1', [element, next.sourceTimezone, next.epochUnit]);
      return ok({ ...next, schemaTimezone: row.schemaTimezone, effectiveSourceTimezone: effective });
    });
  }
  setSchema(ctx: TemporalContext, source: SourceId, schema: string, input: unknown) {
    const parsed = schemaTimezonePatch.safeParse(input);
    if (!parsed.success) return Promise.resolve(err(new DomainError('validation_failed', 'sourceTimezone must name a valid IANA timezone.')));
    return withTenant(ctx, async tx => {
      const locked = await tx.query('SELECT id FROM data_source WHERE id=$1 FOR UPDATE', [source]);
      if (!locked.length) return missing();
      const objects = await tx.query('SELECT id FROM catalog_object WHERE source_id=$1 AND schema_name=$2', [source, schema]);
      if (!objects.length) return missing();
      const [old] = await tx.query<{ zone: string }>('SELECT source_timezone AS zone FROM catalog_schema_temporal WHERE source_id=$1 AND schema_name=$2', [source, schema]);
      const next = parsed.data.sourceTimezone;
      const affected = await tx.query<Row>(select + ' WHERE o.source_id=$1 AND o.schema_name=$2 AND e.source_timezone IS NULL', [source, schema]);
      if (old && old.zone !== next && affected.some(row => row.tokenized) && !await confirmed(ctx, parsed.data.confirmation)) return confirmationRequired();
      for (const row of affected.filter(row => row.tokenized)) {
        const valid = validateTokenizedTemporal(row.duckdbType, { sourceTimezone: next, epochUnit: row.epochUnit });
        if (!valid.ok) return valid;
      }
      if (next === null) await tx.query('DELETE FROM catalog_schema_temporal WHERE source_id=$1 AND schema_name=$2', [source, schema]);
      else await tx.query('INSERT INTO catalog_schema_temporal(source_id,project_id,schema_name,source_timezone) VALUES($1,$2,$3,$4) ON CONFLICT(source_id,schema_name) DO UPDATE SET source_timezone=EXCLUDED.source_timezone', [source, ctx.projectId, schema, next]);
      return ok(undefined);
    });
  }
}
