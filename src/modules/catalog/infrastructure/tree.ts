import { classifySourceType } from '../domain/type-mapping.js';
import { z } from 'zod';
import { withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok } from '../../../shared/kernel/index.js';
import type { CatalogNode } from '../../../shared/api/catalog.js';
import type { CatalogContext, CatalogTreeReader, TreeRead } from '../application/tree.js';
const uuid = z.uuid();
type Row = { schema_name?:string; qualified_name?:string; source_type?: string; id: string; label: string | null; child_count: number | null; exposed_type: string | null; position: string };
export class PostgresCatalogTreeReader implements CatalogTreeReader {
  read(context: CatalogContext, query: TreeRead) {
    return withTenant(context, async tx => {
      let kind: CatalogNode['kind']; let rows: Row[];
      const { parent, prefix, after, limit } = query;
      const declared="(e.token_domain IS NOT NULL OR e.case_insensitive IS NOT NULL OR e.source_timezone IS NOT NULL OR e.epoch_unit IS NOT NULL OR e.canon_id IS NOT NULL)";
      const awaiting="e.exposed_type IS NOT NULL AND e.exposed_name IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM pool) OR EXISTS(SELECT 1 FROM pool p WHERE NOT EXISTS(SELECT 1 FROM entitlement t WHERE t.pool_id=p.id AND t.element_id=e.id)))";
      const elementFilter=query.filter==='declared'?declared:query.filter==='undecided'?awaiting:'true';
      const invalid = () => err(new DomainError('validation_failed', 'The catalogue parent or cursor is invalid.'));
      const missing = () => err(new DomainError('not_found', 'This catalogue branch was not found in the project.'));
      if (!parent) {
        if (after !== null && !uuid.safeParse(after).success) return invalid();
        kind = 'source';
        rows = await tx.query<Row>(`SELECT s.id, s.id::text AS position, s.exposed_alias AS label,
          (SELECT count(DISTINCT o.exposed_schema)::int FROM catalog_object o WHERE o.source_id=s.id AND o.status='active') AS child_count, NULL::text AS exposed_type
          FROM data_source s WHERE s.status<>'archived' AND starts_with(s.exposed_alias,$1) AND ($2::uuid IS NULL OR s.id>$2) ORDER BY s.id LIMIT $3`, [prefix, after, limit]);
      } else if(parent.startsWith('objects:')) {
        const source=parent.slice(8);
        if(!uuid.safeParse(source).success||(after!==null&&!uuid.safeParse(after).success))return invalid();
        const exists=await tx.query("SELECT id FROM data_source WHERE id=$1 AND status<>'archived'",[source]);
        if(!exists.length)return missing();
        kind='object';
        rows=await tx.query<Row>(`SELECT o.id,o.id::text AS position,o.exposed_name AS label,o.exposed_schema AS schema_name,
          concat_ws('.',s.exposed_alias,o.exposed_schema,o.exposed_name) AS qualified_name,
          (SELECT count(*)::int FROM catalog_element e WHERE e.object_id=o.id AND e.status='active') AS child_count,NULL::text AS exposed_type
          FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.source_id=$1 AND o.status='active' AND starts_with(o.exposed_name,$2) AND (${query.filter===undefined||query.filter==='all'?'true':`EXISTS(SELECT 1 FROM catalog_element e WHERE e.object_id=o.id AND e.status='active' AND ${elementFilter})`})
          AND ($3::uuid IS NULL OR o.id>$3) ORDER BY o.id LIMIT $4`,[source,prefix,after,limit]);
      } else if (parent.includes(':')) {
        const split = parent.indexOf(':'); const source = parent.slice(0, split); const schema = parent.slice(split + 1);
        if (!uuid.safeParse(source).success || !schema || schema.length > 63 || (after !== null && !uuid.safeParse(after).success)) return invalid();
        const exists = await tx.query(`SELECT o.id FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.source_id=$1 AND o.exposed_schema=$2 AND o.status='active' AND s.status<>'archived' LIMIT 1`, [source, schema]);
        if (!exists.length) return missing();
        kind = 'object';
        rows = await tx.query<Row>(`SELECT o.id, o.id::text AS position, o.exposed_name AS label,
          (SELECT count(*)::int FROM catalog_element e WHERE e.object_id=o.id AND e.status='active') AS child_count, NULL::text AS exposed_type
          FROM catalog_object o WHERE o.source_id=$1 AND o.exposed_schema=$2 AND o.status='active' AND starts_with(o.exposed_name,$3)
          AND ($4::uuid IS NULL OR o.id>$4) ORDER BY o.id LIMIT $5`, [source, schema, prefix, after, limit]);
      } else {
        if (!uuid.safeParse(parent).success) return invalid();
        const source = await tx.query("SELECT id FROM data_source WHERE id=$1 AND status<>'archived'", [parent]);
        if (source.length) {
          kind = 'schema';
          if (after !== null && after.length > 63) return invalid();
          rows = await tx.query<Row>(`SELECT $1::text || ':' || exposed_schema AS id, exposed_schema AS position, exposed_schema AS label,
            count(*)::int AS child_count, NULL::text AS exposed_type FROM catalog_object WHERE source_id=$1::uuid AND status='active'
            AND starts_with(exposed_schema,$2) AND ($3::text IS NULL OR exposed_schema COLLATE "C">$3 COLLATE "C")
            GROUP BY exposed_schema ORDER BY exposed_schema COLLATE "C" LIMIT $4`, [parent, prefix, after, limit]);
        } else {
          if (after !== null && !uuid.safeParse(after).success) return invalid();
          const object = await tx.query(`SELECT o.id FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.id=$1 AND o.status='active' AND s.status<>'archived'`, [parent]);
          if (!object.length) return missing();
          kind = 'element';
          rows = await tx.query<Row>(`SELECT id, id::text AS position, exposed_name AS label, NULL::int AS child_count,
            source_type, CASE WHEN exposed_name IS NULL THEN NULL ELSE exposed_type END AS exposed_type FROM catalog_element e
            WHERE ${elementFilter} AND object_id=$1 AND status='active' AND ($2='' OR starts_with(exposed_name,$2))
            AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`, [parent, prefix, after, limit]);
        }
      }
      // Enrich the bounded page in two metadata queries, never one request per element.
      const ids=rows.map(row=>row.id);
      const decisions=kind==='object'||kind==='element'?await tx.query<{id:string;value:'clear'|'masked'|'aggregate_only'|'tokenized'|'withheld'|'undecided';count:number}>(`SELECT ${kind==='object'?'e.object_id':'e.id'} AS id,coalesce(t.treatment,'undecided') AS value,count(*)::int AS count
        FROM catalog_element e CROSS JOIN pool p LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=p.id
        WHERE ${kind==='object'?'e.object_id':'e.id'}=ANY($1::uuid[]) AND e.status='active' AND e.exposed_type IS NOT NULL AND e.exposed_name IS NOT NULL
        GROUP BY 1,2`,[ids]):[];
      const metadata=kind==='element'?await tx.query<{id:string;tokenDomain:string|null;sourceTimezone:string|null;timezoneProvenance:'declared'|'inherited'|'missing';declared:boolean;qualifiedName:string}>(`SELECT e.id,e.token_domain AS "tokenDomain",
        CASE WHEN e.exposed_type='TIMESTAMP' THEN coalesce(e.source_timezone,d.source_timezone) ELSE NULL END AS "sourceTimezone",
        CASE WHEN e.source_timezone IS NOT NULL THEN 'declared' WHEN d.source_timezone IS NOT NULL THEN 'inherited' ELSE 'missing' END AS "timezoneProvenance",
        (e.token_domain IS NOT NULL OR e.case_insensitive IS NOT NULL OR e.source_timezone IS NOT NULL OR e.epoch_unit IS NOT NULL OR e.canon_id IS NOT NULL) AS declared,
        concat_ws('.',s.exposed_alias,o.exposed_schema,o.exposed_name,e.exposed_name) AS "qualifiedName"
        FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
        LEFT JOIN catalog_schema_temporal d ON d.source_id=s.id AND d.schema_name=o.schema_name WHERE e.id=ANY($1::uuid[])`,[ids]):[];
      const undecided=kind==='object'?await tx.query<{id:string;count:number}>(`SELECT e.object_id AS id,count(*)::int AS count FROM catalog_element e WHERE e.object_id=ANY($1::uuid[]) AND e.status='active' AND e.exposed_type IS NOT NULL AND e.exposed_name IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM pool) OR EXISTS(SELECT 1 FROM pool p WHERE NOT EXISTS(SELECT 1 FROM entitlement t WHERE t.pool_id=p.id AND t.element_id=e.id))) GROUP BY e.object_id`,[ids]):[];
      return ok(rows.map(row => ({ position: row.position, node: {
        kind, ...(row.schema_name?{schemaName:row.schema_name}:{}),...(row.qualified_name?{qualifiedName:row.qualified_name}:{}),
        ...(kind==='object'||kind==='element'?{decisions:decisions.filter(d=>d.id===row.id).map(({value,count})=>({value,count})),...(kind==='object'?{undecidedCount:undecided.find(d=>d.id===row.id)?.count??0}:{})}:{}),
        ...(kind==='element'?(()=>{const m=metadata.find(m=>m.id===row.id);return m?{qualifiedName:m.qualifiedName,declarations:{tokenDomain:m.tokenDomain,sourceTimezone:m.sourceTimezone,timezoneProvenance:m.timezoneProvenance,isolated:m.tokenDomain===null,declared:m.declared}}:{};})():{}),
        ...(kind==='element'?{sourceType:row.source_type??null}:{}), id: row.id, label: row.label, childCount: row.child_count, exposedType: row.exposed_type,
        ...(kind==='element'&&row.label!==null&&row.exposed_type===null?{unsupportedReason:classifySourceType(row.source_type ?? '').unsupportedReason??'unmapped'}:{}),
        state: kind !== 'element' ? null : row.label === null ? 'unnameable' as const : row.exposed_type === null ? 'unsupported' as const : (()=>{const values=decisions.filter(d=>d.id===row.id).map(d=>d.value);return values.length>1?'mixed' as const:values[0]??'undecided' as const;})(),
      } })));
    });
  }
}
