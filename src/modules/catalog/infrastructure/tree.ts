import { z } from 'zod';
import { withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok } from '../../../shared/kernel/index.js';
import type { CatalogNode } from '../../../shared/api/catalog.js';
import type { CatalogContext, CatalogTreeReader, TreeRead } from '../application/tree.js';
const uuid = z.uuid();
type Row = { id: string; label: string | null; child_count: number | null; duckdb_type: string | null; position: string };
export class PostgresCatalogTreeReader implements CatalogTreeReader {
  read(context: CatalogContext, query: TreeRead) {
    return withTenant(context, async tx => {
      let kind: CatalogNode['kind']; let rows: Row[];
      const { parent, prefix, after, limit } = query;
      const invalid = () => err(new DomainError('validation_failed', 'The catalogue parent or cursor is invalid.'));
      const missing = () => err(new DomainError('not_found', 'This catalogue branch was not found in the project.'));
      if (!parent) {
        if (after !== null && !uuid.safeParse(after).success) return invalid();
        kind = 'source';
        rows = await tx.query<Row>(`SELECT s.id, s.id::text AS position, s.duckdb_alias AS label,
          (SELECT count(DISTINCT o.duckdb_schema)::int FROM catalog_object o WHERE o.source_id=s.id AND o.status='active') AS child_count, NULL::text AS duckdb_type
          FROM data_source s WHERE s.status<>'archived' AND starts_with(s.duckdb_alias,$1) AND ($2::uuid IS NULL OR s.id>$2) ORDER BY s.id LIMIT $3`, [prefix, after, limit]);
      } else if (parent.includes(':')) {
        const split = parent.indexOf(':'); const source = parent.slice(0, split); const schema = parent.slice(split + 1);
        if (!uuid.safeParse(source).success || !schema || schema.length > 63 || (after !== null && !uuid.safeParse(after).success)) return invalid();
        const exists = await tx.query(`SELECT o.id FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.source_id=$1 AND o.duckdb_schema=$2 AND o.status='active' AND s.status<>'archived' LIMIT 1`, [source, schema]);
        if (!exists.length) return missing();
        kind = 'object';
        rows = await tx.query<Row>(`SELECT o.id, o.id::text AS position, o.duckdb_name AS label,
          (SELECT count(*)::int FROM catalog_element e WHERE e.object_id=o.id AND e.status='active') AS child_count, NULL::text AS duckdb_type
          FROM catalog_object o WHERE o.source_id=$1 AND o.duckdb_schema=$2 AND o.status='active' AND starts_with(o.duckdb_name,$3)
          AND ($4::uuid IS NULL OR o.id>$4) ORDER BY o.id LIMIT $5`, [source, schema, prefix, after, limit]);
      } else {
        if (!uuid.safeParse(parent).success) return invalid();
        const source = await tx.query("SELECT id FROM data_source WHERE id=$1 AND status<>'archived'", [parent]);
        if (source.length) {
          kind = 'schema';
          if (after !== null && after.length > 63) return invalid();
          rows = await tx.query<Row>(`SELECT $1::text || ':' || duckdb_schema AS id, duckdb_schema AS position, duckdb_schema AS label,
            count(*)::int AS child_count, NULL::text AS duckdb_type FROM catalog_object WHERE source_id=$1::uuid AND status='active'
            AND starts_with(duckdb_schema,$2) AND ($3::text IS NULL OR duckdb_schema COLLATE "C">$3 COLLATE "C")
            GROUP BY duckdb_schema ORDER BY duckdb_schema COLLATE "C" LIMIT $4`, [parent, prefix, after, limit]);
        } else {
          if (after !== null && !uuid.safeParse(after).success) return invalid();
          const object = await tx.query(`SELECT o.id FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.id=$1 AND o.status='active' AND s.status<>'archived'`, [parent]);
          if (!object.length) return missing();
          kind = 'element';
          rows = await tx.query<Row>(`SELECT id, id::text AS position, duckdb_name AS label, NULL::int AS child_count,
            CASE WHEN duckdb_name IS NULL THEN NULL ELSE duckdb_type END AS duckdb_type FROM catalog_element
            WHERE object_id=$1 AND status='active' AND ($2='' OR starts_with(duckdb_name,$2))
            AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`, [parent, prefix, after, limit]);
        }
      }
      return ok(rows.map(row => ({ position: row.position, node: {
        kind, id: row.id, label: row.label, childCount: row.child_count, duckdbType: row.duckdb_type,
        state: kind !== 'element' ? null : row.label === null ? 'unnameable' as const : row.duckdb_type === null ? 'unsupported' as const : 'undecided' as const,
      } })));
    });
  }
}
