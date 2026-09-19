import { Client } from 'pg';
import { z } from 'zod';
import { AsciiTransliterator, CatalogNaming } from '../../../src/modules/catalog/index.js';
import { DomainError, DuckDbName, err, ok, type Result } from '../../../src/shared/kernel/index.js';
import { landingReceiptSchema, type LandingReceipt } from '../../../src/shared/landing-contract.js';
import type { VaultPort } from '../../../src/platform/vault/index.js';
import type { LandingInput, LandingPort, LandingSource } from '../landing-port.js';

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const qualified = (schema: string, table: string) => `${quote(schema)}.${quote(table)}`;
const naming = new CatalogNaming(new AsciiTransliterator());
const columnsSchema = z.array(z.object({ name: z.string(), type: z.enum(['TEXT', 'NUMERIC', 'BOOLEAN', 'DATE']), filingId: z.uuid() }));
const provenance = ['_opintel_filing_id', '_opintel_as_at', '_opintel_period', '_opintel_received_at', '_opintel_file_sha256'];
const metadata = '_opintel_landing';

/** A write scope for the customer's landing database, separate from both the
 * read-only connector scope and the application's handwritten metadata scopes.
 * Commit receipts live in the SAME transaction as DDL and rows. They are replay
 * protection, not a second register of arrivals/quarantines (item 3.10). */
export class PostgresLanding implements LandingPort {
  constructor(private readonly vault: Pick<VaultPort, 'resolve'>, private readonly statementTimeoutMs = 30_000) {}
  private async scope<T>(source: LandingSource, work: (db: Client, schema: string) => Promise<T>): Promise<Result<T>> {
    let db: Client | undefined;
    try {
      const credential = await this.vault.resolve(source.credentialRef);
      db = new Client({ connectionString: credential, connectionTimeoutMillis: 5000, statement_timeout: this.statementTimeoutMs, application_name: 'opintel-sidecar-landing' });
      db.on('error', () => {});
      await db.connect(); await db.query('BEGIN');
      await db.query("SELECT set_config('search_path','pg_catalog',true), set_config('lock_timeout',$1,true)", [String(this.statementTimeoutMs)]);
      // Bootstrap and namespace allocation are serialized across sources. The
      // source lock below then serializes whole filings, including schema drift.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('opintel-landing-bootstrap',0))");
      await db.query(`CREATE SCHEMA IF NOT EXISTS ${quote(metadata)}`);
      await db.query(`CREATE TABLE IF NOT EXISTS ${qualified(metadata, 'sources')} (
        source_id uuid PRIMARY KEY, project_id uuid NOT NULL, schema_name text UNIQUE NOT NULL, strategy text)`);
      await db.query(`CREATE TABLE IF NOT EXISTS ${qualified(metadata, 'groups')} (
        source_id uuid NOT NULL, party_id uuid NOT NULL, kind text NOT NULL, table_name text NOT NULL, columns jsonb NOT NULL,
        PRIMARY KEY(source_id,party_id,kind), UNIQUE(source_id,table_name))`);
      // Forward-only customer schema upgrade under the same advisory lock and
      // transaction as landing. PostgreSQL preserves PK/FK/index bindings on a
      // column rename; no table copy or name reassignment occurs.
      const attributes = await db.query<{ attname: string }>("SELECT attname FROM pg_attribute WHERE attrelid=to_regclass('_opintel_landing.groups') AND attnum>0 AND NOT attisdropped");
      const hasLegacyParty = attributes.rows.some((row) => row.attname === 'cedant_id');
      const hasParty = attributes.rows.some((row) => row.attname === 'party_id');
      if (hasLegacyParty && hasParty) throw new DomainError('conflict', 'Landing groups contain both old and new party columns; operator reconciliation is required.');
      if (hasLegacyParty) await db.query(`ALTER TABLE ${qualified(metadata, 'groups')} RENAME COLUMN cedant_id TO party_id`);
      const constraint = await db.query("SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('_opintel_landing.groups') AND conname='groups_kind_nonempty'");
      if (!constraint.rowCount) await db.query(`ALTER TABLE ${qualified(metadata, 'groups')} ADD CONSTRAINT groups_kind_nonempty CHECK (length(kind)>0)`);
      await db.query(`CREATE TABLE IF NOT EXISTS ${qualified(metadata, 'commits')} (
        filing_id uuid PRIMARY KEY, source_id uuid NOT NULL, receipt jsonb NOT NULL)`);
      const existing = await db.query<{ schema_name: string; project_id: string; strategy: string | null }>(`SELECT * FROM ${qualified(metadata, 'sources')} WHERE source_id=$1 FOR UPDATE`, [source.sourceId]);
      let schema = existing.rows[0]?.schema_name;
      if (existing.rows[0] && existing.rows[0].project_id !== source.projectId) throw new DomainError('conflict', 'Landing source belongs to another project.');
      if (existing.rows[0]?.strategy && existing.rows[0].strategy !== source.strategy) throw new DomainError('conflict', `Landing strategy is ${existing.rows[0].strategy}; received ${source.strategy}.`);
      if (!schema) {
        const occupied = await db.query<{ nspname: string }>('SELECT nspname FROM pg_namespace');
        schema = naming.assign(source.name, occupied.rows.map((row) => DuckDbName(row.nspname))).name ?? undefined;
        if (!schema) throw new DomainError('validation_failed', 'The source name cannot name a landing schema.');
        await db.query(`CREATE SCHEMA ${quote(schema)}`);
        await db.query(`INSERT INTO ${qualified(metadata, 'sources')} VALUES ($1,$2,$3,NULL)`, [source.sourceId, source.projectId, schema]);
      }
      const result = await work(db, schema);
      await db.query('COMMIT'); return ok(result);
    } catch (error) {
      await db?.query('ROLLBACK').catch(() => {});
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      return err(error instanceof DomainError ? error : /^22/.test(code) || code === '54011'
        ? new DomainError('validation_failed', 'The filing cannot be represented by its declared PostgreSQL columns.')
        : new DomainError('source_unavailable', 'Landing database operation failed; the filing remains available for retry.'));
    } finally { await db?.end().catch(() => {}); }
  }
  async connect(source: LandingSource): Promise<Result<void>> {
    if (!['append_as_at', 'table_per_filing'].includes(source.strategy)) return err(new DomainError('validation_failed', 'A landing source requires an explicit strategy.'));
    return this.scope(source, async () => undefined);
  }
  async land(input: LandingInput, rows: AsyncIterable<Result<Array<string | null>>>): Promise<Result<LandingReceipt>> {
    if (!['append_as_at', 'table_per_filing'].includes(input.source.strategy)) return err(new DomainError('validation_failed', 'A landing source requires an explicit strategy.'));
    if (input.kind.length === 0) return err(new DomainError('validation_failed', 'A filing kind must be non-empty.'));
    return this.scope(input.source, async (db, schema) => {
      const replay = await db.query<{ receipt: unknown }>(`SELECT receipt FROM ${qualified(metadata, 'commits')} WHERE filing_id=$1`, [input.filingId]);
      if (replay.rows[0]) {
        const receipt = landingReceiptSchema.parse(replay.rows[0].receipt);
        if (receipt.sourceId !== input.source.sourceId || receipt.projectId !== input.source.projectId || receipt.fileSha256 !== input.fileSha256 || receipt.strategy !== input.source.strategy)
          throw new DomainError('conflict', 'The filing ID already names a different committed filing.');
        return receipt;
      }
      const names = new Set<string>();
      for (const column of input.columns) {
        if (!column.name || Buffer.byteLength(column.name) > 63 || column.name.includes('\0') || column.name.toLowerCase().startsWith('_opintel_') || names.has(column.name))
          throw new DomainError('validation_failed', `Column ${JSON.stringify(column.name)} cannot be landed without changing its identity.`);
        names.add(column.name);
      }
      const group = await db.query<{ table_name: string; columns: unknown }>(`SELECT * FROM ${qualified(metadata, 'groups')} WHERE source_id=$1 AND party_id=$2 AND kind=$3`, [input.source.sourceId, input.partyId, input.kind]);
      const previous = group.rows[0];
      const columns = previous ? columnsSchema.parse(previous.columns) : [];
      for (const column of input.columns) {
        const old = columns.find((entry) => entry.name === column.name);
        if (old && old.type !== column.type) throw new DomainError('validation_failed', `Column ${JSON.stringify(column.name)} changed from ${old.type} to ${column.type}; established by filing ${old.filingId}.`);
      }
      let base = previous?.table_name;
      if (!base) {
        const occupied = await db.query<{ table_name: string }>(`SELECT table_name FROM ${qualified(metadata, 'groups')} WHERE source_id=$1`, [input.source.sourceId]);
        base = naming.assign(`${input.partyCode}_${input.kind}`, occupied.rows.map((row) => DuckDbName(row.table_name))).name ?? undefined;
        if (!base) throw new DomainError('validation_failed', 'The filing party code cannot name a landing table.');
      }
      const table = input.source.strategy === 'append_as_at' ? base : `${base.slice(0, 30)}_${input.filingId.replaceAll('-', '')}`;
      const target = qualified(schema, table);
      const added = input.columns.filter((column) => !columns.some((old) => old.name === column.name));
      if (!previous || input.source.strategy === 'table_per_filing') {
        await db.query(`CREATE TABLE ${target} (${input.columns.map((column) => `${quote(column.name)} ${column.type}`).concat([
          '_opintel_filing_id uuid NOT NULL', '_opintel_as_at date', '_opintel_period text NOT NULL', '_opintel_received_at timestamptz NOT NULL', '_opintel_file_sha256 text NOT NULL',
        ]).join(',')})`);
      } else {
        for (const column of added) await db.query(`ALTER TABLE ${target} ADD COLUMN ${quote(column.name)} ${column.type}`);
      }
      let rowCount = 0; let batchBytes = 0; let batch: Array<Array<string | null>> = [];
      const allNames = [...input.columns.map((column) => column.name), ...provenance];
      const batchSize = Math.max(1, Math.min(100, Math.floor(60_000 / allNames.length)));
      const flush = async () => {
        if (!batch.length) return;
        const values = batch.flat();
        const placeholders = batch.map((_row, index) => `(${allNames.map((_name, col) => `$${index * allNames.length + col + 1}`).join(',')})`);
        await db.query(`INSERT INTO ${target} (${allNames.map(quote).join(',')}) VALUES ${placeholders.join(',')}`, values);
        batch = []; batchBytes = 0;
      };
      for await (const row of rows) {
        if (!row.ok) throw row.error;
        if (row.value.length !== input.columns.length) throw new DomainError('validation_failed', 'Extracted row width changed during landing.');
        batchBytes += row.value.reduce<number>((total, value) => total + (value === null ? 0 : Buffer.byteLength(value)), 0);
        batch.push([...row.value, input.filingId, input.asAt, input.period, input.receivedAt, input.fileSha256]); rowCount += 1;
        if (batch.length >= batchSize || batchBytes >= 2 * 1024 * 1024) await flush();
      }
      await flush();
      columns.push(...added.map((column) => ({ name: column.name, type: column.type, filingId: input.filingId })));
      await db.query(`INSERT INTO ${qualified(metadata, 'groups')} VALUES ($1,$2,$3,$4,$5) ON CONFLICT (source_id,party_id,kind) DO UPDATE SET columns=EXCLUDED.columns`,
        [input.source.sourceId, input.partyId, input.kind, base, JSON.stringify(columns)]);
      await db.query(`UPDATE ${qualified(metadata, 'sources')} SET strategy=$2 WHERE source_id=$1`, [input.source.sourceId, input.source.strategy]);
      const receipt: LandingReceipt = { filingId: input.filingId, sourceId: input.source.sourceId, projectId: input.source.projectId, partyCode: input.partyCode,
        kind: input.kind, period: input.period, asAt: input.asAt, strategy: input.source.strategy, landedTable: target, rowCount,
        fileSha256: input.fileSha256, supersedes: input.supersedes, landedAt: new Date().toISOString() };
      await db.query(`INSERT INTO ${qualified(metadata, 'commits')} VALUES ($1,$2,$3)`, [input.filingId, input.source.sourceId, JSON.stringify(receipt)]);
      return receipt;
    });
  }
}
