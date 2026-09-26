import { describe, expect, it } from 'vitest';
import { compileViews, DuckDBQueryParser, QueryPreFilter, type QueryParserPort } from '../src/modules/entitlements/index.js';
import { ok } from '../src/shared/kernel/index.js';
import { fixture, unwrap } from './fixtures/view-compiler/input.js';
import { errorCodeSchema } from '../src/shared/error-contract.js';

const parser = new DuckDBQueryParser();
const inspector = new QueryPreFilter(parser);
const queryEngineBuild = 'v1.4.3/d1dc88f950';
const table = 'fixture_catalog.fixture_schema.orders';
const compilation = compileViews(fixture([{ name: 'orders', columns: [
  { name: 'city', treatment: 'clear' },
  { name: 'id', treatment: 'tokenized' },
  { name: 'amount', treatment: 'aggregate_only', type: 'BIGINT' },
  { name: 'hidden', treatment: 'withheld' },
  { name: 'undecided', treatment: null },
] }]));
const views = unwrap(compilation).views;
const inspect = (sql: string) => inspector.inspect({ sql, queryEngineBuild, views });

describe('4.5 application pre-filter — real DuckDB syntax, no execution permission', () => {
  it.each([
    ['VC-10', `SELECT amount FROM ${table}`],
    ['VC-12', `SELECT city FROM ${table} WHERE amount > 0`],
    ['VC-13', `SELECT SUM(amount) FROM ${table} ORDER BY amount`],
    ['VC-27', `SELECT COUNT(*) FROM ${table} WHERE amount IS NULL`],
    ['H-008', `SELECT * FROM ${table}`],
    ['direct aggregate argument', `SELECT SUM(amount + 1) FROM ${table}`],
    ['GROUP BY', `SELECT SUM(amount) FROM ${table} GROUP BY amount`],
    ['HAVING', `SELECT SUM(amount) FROM ${table} HAVING amount > 0`],
    ['JOIN predicate', `SELECT a.city FROM ${table} a JOIN ${table} b ON a.amount=b.amount`],
    ['nested projection', `WITH q AS (SELECT amount FROM ${table}) SELECT * FROM q`],
    ['nested FROM', `SELECT * FROM (SELECT amount FROM ${table}) q`],
    ['window', `SELECT SUM(amount) OVER () FROM ${table}`],
  ])('%s refuses aggregate-only disclosure early', async (_id, sql) => {
    const result = await inspect(sql);
    expect(result).toMatchObject({ ok: false, error: { code: 'entitlement_missing', details: { aggregateMinGroupSize: 7, stage: 'application_pre_filter' } } });
    if (!result.ok) expect(result.error.message).toContain('amount');
  });

  it.each([
    ['VC-11', `SELECT city, SUM(amount) FROM ${table} GROUP BY city`],
    ['single-row aggregate', `SELECT SUM(amount) FROM ${table}`],
    ['HAVING aggregate', `SELECT city, SUM(amount) FROM ${table} GROUP BY city HAVING SUM(amount) > 0`],
    ['count distinct', `SELECT COUNT(DISTINCT amount) FROM ${table}`],
    ['COUNT(*)', `SELECT COUNT(*) FROM ${table}`],
    ['CTE aggregate result', `WITH q AS (SELECT SUM(amount) AS total FROM ${table}) SELECT total FROM q`],
    ['DESCRIBE', `DESCRIBE ${table}`],
    ['VALUES', 'VALUES (1), (2)'],
    ['literal', "SELECT 'not a table; ATTACH'"],
    ['VC-23 is enforced by S2 cardinality', `SELECT city, SUM(amount) FROM ${table} WHERE id = 'held-token' GROUP BY city`],
  ])('%s leaves all authoritative checks to S2', async (_id, sql) => {
    expect(await inspect(sql)).toEqual(ok({ kind: 'requires_sidecar_inspection' }));
  });

  it.each([
    `SELECT id FROM ${table} ORDER BY id`,
    ...['<', '<=', '>', '>='].map(op => `SELECT city FROM ${table} WHERE id ${op} 'token'`),
    `SELECT city FROM ${table} WHERE id BETWEEN 'a' AND 'b'`,
    `SELECT MIN(id) FROM ${table}`, `SELECT MAX(id) FROM ${table}`,
    `SELECT city FROM ${table} WHERE id LIKE 'a%'`,
    ...['+', '-', '*', '/', '%'].map(op => `SELECT id ${op} 1 FROM ${table}`),
    `SELECT id AS token FROM ${table} ORDER BY token`,
    `SELECT id FROM ${table} ORDER BY 1`,
    `SELECT id AS city FROM ${table} ORDER BY 1`,
    `SELECT id FROM ${table} ORDER BY 1 DESC`,
    `WITH q AS (SELECT id AS token FROM ${table}) SELECT token FROM q ORDER BY token`,
    `WITH q(token) AS (SELECT id FROM ${table}) SELECT token FROM q WHERE token > 'x'`,
    `SELECT q.token FROM (SELECT id AS token FROM ${table}) q ORDER BY q.token`,
    `SELECT COUNT(*) OVER (ORDER BY id RANGE BETWEEN 1 PRECEDING AND CURRENT ROW) FROM ${table}`,
  ])('VC-29 refuses a token operation: %s', async sql => {
    const result = await inspect(sql);
    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported_on_token', details: { stage: 'application_pre_filter' } } });
    if (!result.ok) { expect(result.error.message).toContain('id'); expect(result.error.message).toContain('tokens preserve equality only'); }
  });

  it.each([
    `SELECT id FROM ${table} WHERE id = 'token'`,
    `SELECT id FROM ${table} WHERE id <> 'token'`,
    `SELECT id FROM ${table} WHERE id IN ('a', 'b')`,
    `SELECT id FROM ${table} WHERE id NOT IN ('a', 'b')`,
    `SELECT id FROM ${table} WHERE id IS NULL`,
    `SELECT id, COUNT(*) FROM ${table} GROUP BY id`,
    `SELECT id, COUNT(*) FROM ${table} GROUP BY 1`,
    `SELECT COUNT(id), COUNT(DISTINCT id) FROM ${table}`,
    `SELECT a.id FROM ${table} a JOIN ${table} b ON a.id = b.id`,
    `SELECT DISTINCT id FROM ${table}`,
    `SELECT "ID" FROM "FIXTURE_CATALOG"."FIXTURE_SCHEMA"."ORDERS"`,
    `WITH q AS (SELECT id FROM ${table}) SELECT * FROM q`,
  ])('VC-30 equality operations still require sidecar inspection: %s', async sql => {
    expect(await inspect(sql)).toEqual(ok({ kind: 'requires_sidecar_inspection' }));
  });

  it.each([
    '', 'SELECT', 'SELECT 1; SELECT 2', "ATTACH 'x' AS x", 'SET threads=8',
    "COPY (SELECT 1) TO '/tmp/refused'", 'CREATE TABLE x AS SELECT 1',
    "SELECT * FROM read_csv('/tmp/never-read')", 'SELECT * FROM duckdb_tables()',
    'SELECT * FROM information_schema.tables', 'SELECT * FROM orders',
    `SELECT hidden FROM ${table}`, `SELECT undecided FROM ${table}`, `SELECT missing FROM ${table}`,
    `SELECT id FROM ${table} a JOIN ${table} b ON a.id=b.id`,
    `SELECT id AS city FROM ${table} ORDER BY city`,
    `SELECT SUM(amount) FILTER (WHERE city = 'x') FROM ${table}`,
    `SELECT id::INTEGER FROM ${table}`, `SELECT * EXCLUDE (city) FROM ${table}`,
    `SELECT id FROM ${table} UNION ALL SELECT id FROM ${table}`,
    `SELECT CASE WHEN city = 'x' THEN id ELSE '' END FROM ${table}`,
    `SELECT (SELECT id FROM ${table})`,
    'WITH RECURSIVE q(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM q) SELECT * FROM q',
    'SHOW ALL TABLES',
  ])('refuses uninterpretable or unavailable syntax: %s', async sql => {
    expect(await inspect(sql)).toMatchObject({ ok: false, error: { code: 'sql_not_permitted' } });
  });

  it('parser output is syntax only, including references to nonexistent objects', async () => {
    const parsed = unwrap(await parser.parse('SELECT missing FROM nonexistent'));
    expect(parsed.parserBuild).toBe(queryEngineBuild);
    expect(parsed.tree).toMatchObject({ error: false });
    expect(await inspect('SELECT missing FROM nonexistent')).toMatchObject({ ok: false, error: { code: 'sql_not_permitted' } });
  });

  it('build mismatches and absent builds refuse', async () => {
    for (const build of ['', 'not-loaded', 'v1.4.3/another-build', 'v1.5.0/d1dc88f950']) {
      expect(await inspector.inspect({ sql: 'SELECT 1', views, queryEngineBuild: build })).toMatchObject({ ok: false, error: { code: 'sql_not_permitted' } });
    }
  });

  it('does not discard unknown expression-bearing JSON properties', async () => {
    const parsed = unwrap(await parser.parse('SELECT 1'));
    const tree = parsed.tree as { statements: { node: Record<string, unknown> }[] };
    tree.statements[0]!.node.new_clause = { class: 'COLUMN_REF', column_names: ['amount'] };
    const port: QueryParserPort = { parse: async () => ok(parsed) };
    expect(await new QueryPreFilter(port).inspect({ sql: 'SELECT 1', views, queryEngineBuild })).toMatchObject({ ok: false, error: { code: 'sql_not_permitted' } });
  });

  it('malformed parser output refuses without a text fallback', async () => {
    const port: QueryParserPort = { parse: async () => ok({ parserBuild: queryEngineBuild, tree: { error: false, statements: [{ node: null, named_param_map: [] }] } }) };
    expect(await new QueryPreFilter(port).inspect({ sql: 'SELECT 1', views, queryEngineBuild })).toMatchObject({ ok: false, error: { code: 'sql_not_permitted' } });
  });

  it('error envelope recognises the specified token refusal', () => {
    expect(errorCodeSchema.parse('unsupported_on_token')).toBe('unsupported_on_token');
  });

  it('a changed threshold appears in the next early-refusal reason, without enforcing cardinality', async () => {
    const changed = views.map(v => ({ ...v, constraints: v.constraints.map(c => ({ ...c, minGroupSize: 12 })) }));
    expect(await inspector.inspect({ sql: `SELECT amount FROM ${table}`, queryEngineBuild, views: changed }))
      .toMatchObject({ ok: false, error: { details: { aggregateMinGroupSize: 12 } } });
  });

  it('never returns SQL, a bound statement, a cardinality approval or a reusable execution permit', async () => {
    const sql = `SELECT city, SUM(amount) FROM ${table} GROUP BY city`;
    const before = JSON.stringify(views);
    expect(unwrap(await inspect(sql))).toEqual({ kind: 'requires_sidecar_inspection' });
    expect(JSON.stringify(views)).toBe(before);
  });
});
