import { createHash } from 'node:crypto';
import { transliterate } from 'transliteration';
import type { MigrationClient } from '../src/platform/db/migrate.js';

// Frozen §4.4 normalisation, matching CatalogNaming at migration 026.
// The transliteration dependency is pinned to 2.6.1 in package.json.
const duckDbReservedWords = new Set([
  // DuckDB v1.4.3 parser/kwlist.hpp reserved entries, plus the existing
  // conservative identifier restrictions below. This is a discovery-time list.
  'analyse', 'analyze', 'any', 'array', 'asymmetric', 'both', 'collate',
  'deferrable', 'describe', 'do', 'foreign', 'initially', 'lambda', 'lateral',
  'leading', 'only', 'pivot', 'pivot_longer', 'pivot_wider', 'placing', 'qualify',
  'show', 'some', 'summarize', 'symmetric', 'to', 'trailing', 'unpivot', 'variadic', 'window',
  'all', 'and', 'as', 'asc', 'between', 'by', 'case', 'cast', 'check', 'column', 'constraint',
  'create', 'cross', 'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'except',
  'exists', 'false', 'fetch', 'for', 'from', 'full', 'group', 'having', 'in', 'inner', 'insert',
  'intersect', 'into', 'is', 'join', 'left', 'like', 'limit', 'not', 'null', 'offset', 'on', 'or',
  'order', 'outer', 'primary', 'references', 'returning', 'right', 'select', 'set', 'table', 'then',
  'true', 'union', 'unique', 'update', 'using', 'values', 'when', 'where', 'with',
]);
function ascii(identifier: string): string {
    // Only transliterate letters. Keep punctuation for the normalizer to turn
    // into separators, rather than accepting a library's symbol expansions.
    return Array.from(identifier, (character) => {
      if (/\p{ASCII}/u.test(character)) return character;
      if (/\p{L}|\p{N}/u.test(character)) {
        return transliterate(character.normalize('NFKD').replace(/\p{M}/gu, ''), { unknown: '' });
      }
      return /\p{P}|\p{S}|\p{Z}/u.test(character) ? ' ' : '';
    }).join('');
}
function assign(original: string, reserved: readonly string[]): string | null {
    let base = ascii(original).toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');
    if (base.length === 0) return null;
    if (/^[0-9]/u.test(base)) base = `n_${base}`;
    if (duckDbReservedWords.has(base)) base += '_col';
    const hashSuffix = base.length > 63 ? `_${createHash('sha256').update(original).digest('hex').slice(0, 5)}` : '';
    if (hashSuffix) base = `${base.slice(0, 57)}${hashSuffix}`;
    const occupied = new Set<string>(reserved);
    let candidate = base;
    let suffix = 2;
    while (occupied.has(candidate)) {
      const tail = `_${suffix}`;
      candidate = `${base.slice(0, 63 - tail.length - hashSuffix.length)}${hashSuffix}${tail}`;
      suffix += 1;
    }
    return candidate;
  }


export default async function up(client: MigrationClient): Promise<void> {
  await client.query('LOCK TABLE data_source IN ACCESS EXCLUSIVE MODE');
  const { rows } = await client.query<{ id: string; project_id: string; name: string }>(
    'SELECT id, project_id, name FROM data_source ORDER BY project_id, created_at, id');
  const invalid = rows.filter(row => assign(row.name, []) === null).map(row => row.id);
  if (invalid.length) throw new Error(`Source alias backfill refused. Rename sources whose names normalise to nothing, then retry. Source ids: ${invalid.join(', ')}`);
  await client.query('ALTER TABLE data_source ADD COLUMN duckdb_alias text');
  const reserved = new Map<string, string[]>();
  for (const row of rows) {
    const names = reserved.get(row.project_id) ?? [];
    const alias = assign(row.name, names)!;
    await client.query('UPDATE data_source SET duckdb_alias=$1 WHERE id=$2', [alias, row.id]);
    names.push(alias); reserved.set(row.project_id, names);
  }
  await client.query(`
    ALTER TABLE data_source ALTER COLUMN duckdb_alias SET NOT NULL;
    ALTER TABLE data_source ADD CONSTRAINT data_source_alias_shape CHECK (duckdb_alias ~ '^[a-z_][a-z0-9_]{0,62}$');
    ALTER TABLE data_source ADD CONSTRAINT data_source_project_alias UNIQUE(project_id, duckdb_alias);
    CREATE FUNCTION guard_source_alias() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.duckdb_alias IS DISTINCT FROM OLD.duckdb_alias THEN
        RAISE EXCEPTION 'A source DuckDB alias is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER source_alias_immutable BEFORE UPDATE ON data_source FOR EACH ROW EXECUTE FUNCTION guard_source_alias();
    CREATE INDEX catalog_object_tree ON catalog_object(source_id, duckdb_schema COLLATE "C", id) WHERE status='active';
    CREATE INDEX catalog_element_tree ON catalog_element(object_id, id) WHERE status='active';
  `);
}
