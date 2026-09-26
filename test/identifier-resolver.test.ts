import { DuckDBInstance } from '@duckdb/node-api';
import { describe, expect, it } from 'vitest';
import { compileViews, quoteIdent, resolveIdentifier, type ObjectIdentifier } from '../src/modules/entitlements/index.js';
import { describeElement } from '../src/modules/catalog/index.js';
import { fixture, unwrap } from './fixtures/view-compiler/input.js';

const input = fixture([
  { alias: 'memory', schema: 'main', name: 'available', columns: [
    { name: 'id', type: 'BIGINT', treatment: 'clear' },
    { name: 'secret', treatment: 'withheld' },
    { name: 'pending', treatment: null },
  ] },
  { alias: 'memory', schema: 'main', name: 'withheld', columns: [{ name: 'secret', treatment: 'withheld' }] },
  { alias: 'memory', schema: 'main', name: 'undecided', columns: [{ name: 'pending', treatment: null }] },
  { alias: 'memory', schema: 'main', name: 'mixed', columns: [
    { name: 'secret', treatment: 'withheld' }, { name: 'pending', treatment: null },
  ] },
]);
const compiled = unwrap(compileViews(input));
const address = (name: string): ObjectIdentifier => ({ catalog: 'memory', schema: 'main', name });

describe('4.5a identifier resolver', () => {
  it.each([
    ['VC-19', 'withheld', 'all_withheld', ['withheld', 'explicit decision']],
    ['VC-20', 'undecided', 'all_undecided', ['undecided', 'administrator']],
    ['VC-19/VC-20 mixed', 'mixed', 'mixed_withheld_undecided', ['withheld', 'undecided']],
  ] as const)('%s: omitted object retains its reason', (_id, name, reason, words) => {
    const result = resolveIdentifier(compiled, address(name));
    expect(result).toMatchObject({ ok: false, error: {
      code: 'object_unavailable', details: { object: address(name), reason }, retryable: false,
    } });
    if (!result.ok) {
      expect(result.error.message).toContain(`"memory"."main"."${name}"`);
      for (const word of words) expect(result.error.message).toContain(word);
      expect(result.error.message).not.toContain('not found');
    }
  });

  it('VC-21: a nonexistent object is not_found, not an omission', () => {
    expect(resolveIdentifier(compiled, address('never_existed'))).toMatchObject({ ok: false, error: {
      code: 'not_found', details: { object: address('never_existed') },
    } });
  });

  it('returns the original emitted view without changing either collection', () => {
    const before = JSON.stringify(compiled);
    expect(unwrap(resolveIdentifier(compiled, address('available')))).toBe(compiled.views[0]);
    for (const name of ['withheld', 'undecided', 'mixed', 'absent']) resolveIdentifier(compiled, address(name));
    expect(JSON.stringify(compiled)).toBe(before);
  });

  it('matches all three components and uses only the supplied pool snapshot', () => {
    for (const identifier of [
      { ...address('withheld'), catalog: 'other_pool_source' },
      { ...address('withheld'), schema: 'other_schema' },
    ]) expect(resolveIdentifier(compiled, identifier)).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(resolveIdentifier({ views: [], omitted: [] }, address('withheld'))).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });

  it('matches ASCII case in decoded identifiers without Unicode case folding', () => {
    expect(resolveIdentifier(compiled, { catalog: 'MEMORY', schema: 'MAIN', name: 'WITHHELD' }))
      .toMatchObject({ ok: false, error: { code: 'object_unavailable', details: { reason: 'all_withheld' } } });
    const unicode = { views: [], omitted: [{ ...address('ä'), reason: 'all_withheld' as const }] };
    expect(resolveIdentifier(unicode, address('Ä'))).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });

  it('does not split dots or interpret quotes inside decoded identifier components', () => {
    const identifier = { catalog: 'a.b', schema: 'c', name: 'd"e' };
    const snapshot = { views: [], omitted: [{ ...identifier, reason: 'all_undecided' as const }] };
    expect(resolveIdentifier(snapshot, identifier)).toMatchObject({ ok: false, error: { code: 'object_unavailable' } });
    expect(resolveIdentifier(snapshot, { catalog: 'a', schema: 'b.c', name: 'd"e' }))
      .toMatchObject({ ok: false, error: { code: 'not_found' } });
  });

  it.each(['', 'bad\0name'])('refuses invalid components: %j', name => {
    expect(resolveIdentifier(compiled, address(name))).toMatchObject({ ok: false, error: { code: 'sql_not_permitted' } });
  });

  it('fails closed on contradictory or duplicate matches', () => {
    const view = compiled.views[0]!;
    for (const snapshot of [
      { views: [view, view], omitted: [] },
      { views: [view], omitted: [{ ...address(view.name), reason: 'all_withheld' as const }] },
      { views: [], omitted: [compiled.omitted[0]!, compiled.omitted[0]!] },
    ]) {
      const name = snapshot.views[0]?.name ?? snapshot.omitted[0]!.name;
      expect(resolveIdentifier(snapshot, address(name))).toMatchObject({ ok: false, error: { code: 'sql_not_permitted' } });
    }
  });

  it('VC-22: real DESCRIBE and duckdb_columns contain no dummy column or omitted object', async () => {
    // Single empty database, synthetic staging fixture, compiler DDL only.
    // This is not an S2 session construction, isolation proof or MCP describe handler.
    const instance = await DuckDBInstance.create(':memory:');
    try {
      const connection = await instance.connect();
      try {
        await connection.run('CREATE SCHEMA __staging');
        await connection.run('CREATE TABLE __staging.memory__main__available (id BIGINT)');
        for (const view of compiled.views) await connection.run(view.ddl);
        for (const name of ['withheld', 'undecided', 'mixed', 'absent']) resolveIdentifier(compiled, address(name));
        const descriptions = [];
        for (const view of compiled.views) {
          const sql = `DESCRIBE ${[view.catalog, view.schema, view.name].map(quoteIdent).join('.')}`;
          const rows = (await connection.runAndReadAll(sql)).getRowObjects();
          expect(rows.map(row => row.column_name)).toEqual(['id']);
          descriptions.push(...rows);
        }
        const columns = (await connection.runAndReadAll(
          'SELECT table_name, column_name FROM duckdb_columns() WHERE database_name = current_database() AND NOT internal ORDER BY table_name, column_index',
        )).getRowObjects();
        expect(columns).toEqual([
          { table_name: 'available', column_name: 'id' },
          { table_name: 'memory__main__available', column_name: 'id' },
        ]);
        const metadata = input.elements.map(element => describeElement(element.state, input.entitlements.get(element.state.id)?.state.treatment ?? null));
        expect(JSON.stringify({ compiled, descriptions, columns, metadata })).not.toContain('_opintel_');
        expect(compiled.views.map(view => view.name)).toEqual(['available']);
      } finally { connection.closeSync(); }
    } finally { instance.closeSync(); }
  }, 30_000);
});
