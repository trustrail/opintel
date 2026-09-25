import { z } from 'zod';
import { DomainError, ElementId, ProjectId, SourceId, Timestamp, err, ok, type Result } from '../../src/shared/kernel/index.js';
import { SecretRef } from '../../src/platform/secrets/types.js';
import * as wire from '../../src/shared/sidecar-contract.js';
import type { CatalogSnapshot, TopValue } from '../../src/modules/sources/index.js';
import type { SamplingAudit, SamplingAuditPort, SidecarConnector } from '../application/source-connector.js';
import { PostgresSourceScope, SourceBusy, SourceTimeout, SourceCancelled, type SourceSession } from './postgres-source-scope.js';

const identifier = z.string().min(1).refine((value) => !value.includes('\0'));
const sampling = wire.samplePayload.extend({ elements: z.array(z.strictObject({ elementId: z.uuid(), schema: identifier, object: identifier, column: identifier })) });
const count = z.number().int().nonnegative().safe();
const relationRow = z.strictObject({ oid: z.string(), schema: z.string(), name: z.string(), kind: z.enum(['table', 'view']), rowEstimate: count.nullable() });
const columnRow = z.strictObject({ oid: z.string(), sourceIdentifier: z.string(), stableRef: z.string(), ordinal: count,
  sourceType: z.string(), nullable: z.boolean(), isKey: z.boolean(), description: z.string().nullable() });
const foreignKeyRow = z.strictObject({ fromObject: z.string(), fromColumn: z.string(), toObject: z.string(), toColumn: z.string() });
const topRow = z.strictObject({ value: z.string(), frequency: z.string().regex(/^\d+$/).transform(Number).pipe(count) });
const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

export class PostgresConnector implements SidecarConnector {
  constructor(private readonly scope: PostgresSourceScope, private readonly audit: SamplingAuditPort) {}

  async testConnection(request: unknown, signal?: AbortSignal) {
    const result = await this.run(request, z.strictObject({}), async (session) => {
      await session.query('SELECT 1');
      return { reachable: true as const };
    }, signal);
    if (result.ok || result.error.code !== 'source_unavailable') return result;
    return ok({ reachable: false as const, reason: result.error.message });
  }

  async introspect(request: unknown, signal?: AbortSignal): Promise<Result<{ snapshot: CatalogSnapshot }>> {
    return this.run(request, wire.introspectPayload, async (session, payload) => {
      const relations = z.array(relationRow).parse(await session.query(`
        SELECT c.oid::text AS oid, n.nspname AS schema, c.relname AS name,
          CASE WHEN c.relkind IN ('v', 'm') THEN 'view' ELSE 'table' END AS kind,
          CASE WHEN c.reltuples < 0 OR c.relkind = 'v' THEN NULL ELSE round(c.reltuples::numeric)::float8 END AS "rowEstimate"
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p','v','m','f')
          AND has_schema_privilege(n.oid, 'USAGE') AND has_any_column_privilege(c.oid, 'SELECT')
          AND (CASE WHEN cardinality($1::text[]) = 0
            THEN n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_'
            ELSE n.nspname = ANY($1::text[]) END)
        ORDER BY n.nspname, c.relname`, [payload.include]));
      const ids = relations.map((row) => row.oid);
      const columns = z.array(columnRow).parse(await session.query(`
        SELECT a.attrelid::text AS oid, a.attname AS "sourceIdentifier", a.attnum::text AS "stableRef",
          a.attnum AS ordinal, pg_catalog.format_type(a.atttypid, a.atttypmod) AS "sourceType",
          NOT a.attnotnull AS nullable,
          EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.conrelid = a.attrelid
            AND k.contype IN ('p','u','f') AND a.attnum = ANY(k.conkey)) AS "isKey",
          pg_catalog.col_description(a.attrelid, a.attnum) AS description
        FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = ANY($1::oid[]) AND a.attnum > 0 AND NOT a.attisdropped
          AND has_column_privilege(a.attrelid, a.attnum, 'SELECT')
        ORDER BY a.attrelid, a.attnum`, [ids]));
      const foreignKeys = z.array(foreignKeyRow).parse(await session.query(`
        SELECT format('%I.%I', fn.nspname, fc.relname) AS "fromObject", fa.attname AS "fromColumn",
          format('%I.%I', tn.nspname, tc.relname) AS "toObject", ta.attname AS "toColumn"
        FROM pg_catalog.pg_constraint k
        JOIN pg_catalog.pg_class fc ON fc.oid = k.conrelid
        JOIN pg_catalog.pg_namespace fn ON fn.oid = fc.relnamespace
        JOIN pg_catalog.pg_class tc ON tc.oid = k.confrelid
        JOIN pg_catalog.pg_namespace tn ON tn.oid = tc.relnamespace
        CROSS JOIN LATERAL unnest(k.conkey, k.confkey) AS pair(f,t)
        JOIN pg_catalog.pg_attribute fa ON fa.attrelid = k.conrelid AND fa.attnum = pair.f
        JOIN pg_catalog.pg_attribute ta ON ta.attrelid = k.confrelid AND ta.attnum = pair.t
        WHERE k.contype = 'f' AND k.conrelid = ANY($1::oid[]) AND k.confrelid = ANY($1::oid[])
          AND has_column_privilege(k.conrelid, pair.f, 'SELECT') AND has_column_privilege(k.confrelid, pair.t, 'SELECT')
        ORDER BY k.oid, pair.f`, [ids]));
      const byObject = new Map<string, CatalogSnapshot['objects'][number]['columns']>();
      for (const { oid, ...column } of columns) {
        const entries = byObject.get(oid) ?? [];
        entries.push(column);
        byObject.set(oid, entries);
      }
      return wire.snapshotResponse.parse({ snapshot: {
        takenAt: Timestamp(new Date()),
        objects: relations.map(({ oid, ...relation }) => ({ ...relation, columns: byObject.get(oid) ?? [] })), foreignKeys,
      } });
    }, signal);
  }

  async sampleTopValues(request: unknown, signal?: AbortSignal): Promise<Result<{ values: Record<string, TopValue[]> }>> {
    const envelope = wire.envelope.safeParse(request);
    if (!envelope.success) return invalid();
    const payload = sampling.safeParse(envelope.data.payload);
    const event: SamplingAudit = {
      requestId: envelope.data.requestId, projectId: ProjectId(envelope.data.projectId), sourceId: SourceId(envelope.data.sourceId),
      elementIds: payload.success ? payload.data.elements.map((element) => ElementId(element.elementId)) : [],
      consentGiven: payload.success, outcome: 'refused',
    };
    if (!payload.success) {
      if (!await this.record(event)) return auditFailure();
      const consent = z.object({ consentGiven: z.literal(true) }).safeParse(envelope.data.payload);
      return consent.success ? invalid() : err(new DomainError('forbidden', 'Sampling requires source consent.'));
    }
    if (new Set(payload.data.elements.map((element) => element.elementId)).size !== payload.data.elements.length) return invalid();
    if (!await this.record({ ...event, outcome: 'started' })) return auditFailure();
    const result = await this.run(request, sampling, async (session, input) => {
      const values: Record<string, TopValue[]> = {};
      for (const element of input.elements) {
        const column = quote(element.column);
        // Identifiers are quoted individually, while the limit remains a value parameter.
        const rows = await session.query(`SELECT ${column}::text AS value, count(*)::text AS frequency
          FROM ${quote(element.schema)}.${quote(element.object)} WHERE ${column} IS NOT NULL
          GROUP BY ${column}::text ORDER BY count(*) DESC, ${column}::text COLLATE "C" LIMIT $1`, [input.limit]);
        values[element.elementId] = z.array(topRow).parse(rows);
      }
      return wire.sampleResponse.parse({ values });
    }, signal);
    if (!await this.record({ ...event, outcome: result.ok ? 'completed' : 'failed' })) return auditFailure();
    return result;
  }

  async estimateRowCount(request: unknown, signal?: AbortSignal): Promise<Result<{ rows: number | null }>> {
    return this.run(request, wire.estimatePayload, async (session, payload) => {
      const rows = await session.query(`SELECT CASE WHEN c.reltuples < 0 OR c.relkind = 'v' THEN NULL
          ELSE round(c.reltuples::numeric)::float8 END AS rows
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p','v','m','f')
          AND has_schema_privilege(n.oid, 'USAGE') AND has_any_column_privilege(c.oid, 'SELECT')`, [payload.object.schema, payload.object.name]);
      if (rows.length !== 1) throw new UnavailableObject();
      return wire.estimateResponse.parse(rows[0]);
    }, signal);
  }

  private async record(event: SamplingAudit): Promise<boolean> {
    try { await this.audit.record(event); return true; } catch { return false; }
  }
  private async run<P, T>(request: unknown, schema: z.ZodType<P>, work: (session: SourceSession, payload: P) => Promise<T>, signal?: AbortSignal): Promise<Result<T>> {
    const parsed = wire.envelope.extend({ payload: schema }).safeParse(request);
    if (!parsed.success) return invalid();
    try {
      const value = await this.scope.run(`${parsed.data.projectId}:${parsed.data.sourceId}`, SecretRef(parsed.data.credentialRef),
        (session) => work(session, parsed.data.payload), signal);
      return ok(value);
    } catch (error: unknown) {
      if (error instanceof SourceCancelled) return err(new DomainError('source_unavailable', 'Source request cancelled.'));
      if (error instanceof DomainError && error.code === 'dependency_unavailable') {
        return err(new DomainError('dependency_unavailable', 'Source credentials are unavailable.', undefined, error.retryable));
      }
      if (error instanceof SourceBusy) return err(new DomainError('budget_exceeded', 'Source connection limit reached.', undefined, true));
      if (error instanceof UnavailableObject) return err(new DomainError('object_unavailable', 'Source object is unavailable.'));
      const code = z.object({ code: z.string() }).safeParse(error);
      const message = error instanceof SourceTimeout || (code.success && code.data.code === '57014') ? 'Source operation timed out.'
        : code.success && ['28P01', '28000'].includes(code.data.code) ? 'Source authentication failed.'
        : 'Source operation failed.';
      return err(new DomainError('source_unavailable', message));
    }
  }
}
class UnavailableObject extends Error {}
const invalid = (): Result<never> => err(new DomainError('validation_failed', 'Invalid source connector request.'));
const auditFailure = (): Result<never> => err(new DomainError('dependency_unavailable', 'Sampling audit is unavailable.'));
