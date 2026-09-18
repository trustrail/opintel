import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CatalogNaming, CatalogObject, describeElement, exposedObjectName, mapSourceType, postTreatmentType, type ElementDiscovery } from '../src/modules/catalog/index.js';
import { AsciiTransliterator } from '../src/modules/catalog/infrastructure/ascii-transliterator.js';
import { DuckDbName, ObjectId, ProjectId, SourceId, TestIdFactory, Timestamp } from '../src/shared/kernel/index.js';

const naming = new CatalogNaming(new AsciiTransliterator());
const now = Timestamp(new Date('2026-01-01T00:00:00Z'));
const column = (sourceIdentifier: string, stableRef = '1'): ElementDiscovery => ({
  sourceIdentifier, stableRef, sourceType: 'int4', duckdbType: mapSourceType('int4'),
  nullable: false, isKey: false, description: null,
});
function object() {
  const result = CatalogObject.create({
    id: ObjectId(randomUUID()), sourceId: SourceId(randomUUID()), projectId: ProjectId(randomUUID()),
    schemaName: 'public', objectName: 'Original Orders', kind: 'table', duckdbSchema: DuckDbName('public'),
    duckdbName: DuckDbName('original_orders'), lineageKnown: true, rowEstimate: null, description: null, status: 'active',
  });
  if (!result.ok) throw result.error;
  return result.value;
}

describe('catalogue naming', () => {
  it.each([
    ['Größe', 'grosse'], ['Crème brûlée', 'creme_brulee'], ['Œuvre / Łódź', 'oeuvre_lodz'],
    ['  Gross -- Written / Premium  ', 'gross_written_premium'], ['123 Sales', 'n_123_sales'],
    ['select', 'select_col'], ['SELECT', 'select_col'], ['qualify', 'qualify_col'], ['window', 'window_col'],
    ['--😀--', null], ['™', null], ['', null],
  ])('G-012: normalises %j to %j', (input, expected) => {
    expect(naming.assign(input)).toEqual({ name: expected, collision: false });
  });

  it('hashes the original long identifier, and keeps collision suffixes within 63 characters', () => {
    const original = 'A'.repeat(70);
    const expected = `${'a'.repeat(57)}_${createHash('sha256').update(original).digest('hex').slice(0, 5)}`;
    expect(naming.assign(original).name).toBe(expected);
    expect(naming.assign('a'.repeat(70)).name).not.toBe(expected);
    const second = naming.assign(original, [DuckDbName(expected)]);
    expect(second).toEqual({ name: `${expected.slice(0, 55)}${expected.slice(57)}_2`, collision: true });
    expect(second.name).toHaveLength(63);
  });

  it('G-013: reserves names, allocates _2 then _3, and emits collision diffs only once', () => {
    const catalog = object();
    const inputs = [column('Gross Premium', '1'), column('gross-premium', '2'), column('gross_premium', '3')];
    const assign = naming.elementIdentity(new TestIdFactory());
    const result = catalog.reconcile(inputs, assign, now);
    if (!result.ok) throw result.error;
    expect(catalog.elements.map((element) => element.state.duckdbName)).toEqual(['gross_premium', 'gross_premium_2', 'gross_premium_3']);
    expect(result.value.filter((entry) => entry.type === 'CatalogNameCollision')).toHaveLength(2);
    expect(catalog.reconcile(inputs, assign, now)).toEqual({ ok: true, value: [] });
  });

  it('G-012/R-003: existing names survive repeat discovery and changes to the naming implementation', () => {
    const catalog = object();
    catalog.reconcile([column('Customer Name')], naming.elementIdentity(new TestIdFactory()), now);
    const changed = new CatalogNaming({ ascii: () => 'different algorithm' });
    const assign = vi.fn(changed.elementIdentity(new TestIdFactory()));
    catalog.reconcile([column('Customer Name')], assign, now);
    catalog.reconcile([column('Account Holder')], assign, now);
    expect(catalog.elements[0]?.state.duckdbName).toBe('customer_name');
    expect(assign).not.toHaveBeenCalled();
  });

  it('retains multiple unnameable elements without conflating null with a collision or undecided', () => {
    const catalog = object();
    const assign = naming.elementIdentity(new TestIdFactory());
    const result = catalog.reconcile([column('😀', '1'), column('---', '2')], assign, now);
    if (!result.ok) throw result.error;
    expect(result.value.filter((entry) => entry.type === 'CatalogElementUnnameable')).toHaveLength(2);
    expect(catalog.elements).toHaveLength(2);
    for (const element of catalog.elements) expect(describeElement(element.state, null)).toMatchObject({ status: 'unnameable', declaredType: null });
    const noAssignment = vi.fn(assign);
    catalog.reconcile([column('Valid Rename', '1'), column('---', '2')], noAssignment, now);
    expect(noAssignment).not.toHaveBeenCalled();
    expect(catalog.elements[0]?.state.duckdbName).toBeNull();
  });

  it('G-010/G-011: a source table rename preserves the exposed namespace until explicit breaking adoption', () => {
    const catalog = object();
    expect(catalog.renameSource('renamed_schema', 'New Orders').ok).toBe(true);
    expect(exposedObjectName(DuckDbName('warehouse'), catalog.state)).toBe('warehouse.public.original_orders');
    const name = naming.assign(catalog.state.objectName).name;
    if (name === null) throw new Error('Missing name.');
    expect(catalog.adoptRenamedName(name)).toEqual({ ok: true, value: [{
      type: 'CatalogNameAdopted', projectId: catalog.state.projectId, objectId: catalog.state.id, breaking: true,
    }] });
    expect(exposedObjectName(DuckDbName('warehouse'), catalog.state)).toBe('warehouse.public.new_orders');
    expect(catalog.state.nameRevision).toBe(1);
    expect(catalog.adoptRenamedName(name)).toEqual({ ok: true, value: [] });
    expect(catalog.state.nameRevision).toBe(1);
  });

  it('explicit element adoption preserves identity, increments once, and rejects another occupied name', () => {
    const catalog = object();
    const assign = naming.elementIdentity(new TestIdFactory());
    catalog.reconcile([column('Old Name'), column('Taken', '2')], assign, now);
    const first = catalog.elements[0];
    if (first === undefined) throw new Error('Missing element.');
    catalog.reconcile([column('New Name'), column('Taken', '2')], assign, now);
    expect(catalog.adoptRenamedName(DuckDbName('taken'), first.state.id).ok).toBe(false);
    expect(catalog.adoptRenamedName(DuckDbName('new_name'), first.state.id)).toMatchObject({ ok: true, value: [{ breaking: true }] });
    expect(catalog.elements[0]?.state).toMatchObject({ id: first.state.id, duckdbName: 'new_name', nameRevision: 1 });
  });
});

describe('catalogue type mapping and describe metadata', () => {
  it.each([
    ['tinyint', 'TINYINT'], ['smallint', 'SMALLINT'], ['int4', 'INTEGER'], ['bigint', 'BIGINT'], ['hugeint', 'HUGEINT'],
    ['numeric(20, 4)', 'DECIMAL(20,4)'], ['numeric(10)', 'DECIMAL(10,0)'], ['real', 'FLOAT'], ['double precision', 'DOUBLE'], ['character varying(40)', 'VARCHAR'],
    ['clob', 'VARCHAR'], ['boolean', 'BOOLEAN'], ['date', 'DATE'], ['timestamp without time zone', 'TIMESTAMP'],
    ['timestamp with time zone', 'TIMESTAMPTZ'], ['uuid', 'UUID'], ['jsonb', 'JSON'], ['integer[][]', 'LIST(LIST(INTEGER))'],
    ['geometry', null], ['bytea', null], ['unknown', null], ['numeric(39,2)', null], ['numeric', null],
  ])('maps %s to %s without narrowing unknown types', (source, expected) => expect(mapSourceType(source)).toBe(expected));

  it('maps structured types recursively and refuses any unsupported nested field', () => {
    expect(mapSourceType({ kind: 'money', precision: 19, scale: 4 })).toBe('DECIMAL(19,4)');
    expect(mapSourceType({ kind: 'uuid', wellFormed: false })).toBe('VARCHAR');
    expect(mapSourceType({ kind: 'struct', fields: [{ name: 'amount', type: 'numeric(12,2)' }] })).toBe('STRUCT("amount" DECIMAL(12,2))');
    expect(mapSourceType({ kind: 'array', element: 'geometry' })).toBeNull();
    expect(mapSourceType({ kind: 'struct', fields: [{ name: 'shape', type: 'geometry' }] })).toBeNull();
  });

  it('describe reports tokenized integers as VARCHAR and unsupported types before entitlement state', () => {
    const catalog = object();
    catalog.reconcile([column('Account Number')], naming.elementIdentity(new TestIdFactory()), now);
    const element = catalog.elements[0];
    if (element === undefined) throw new Error('Missing element.');
    expect(describeElement(element.state, 'tokenized')).toMatchObject({ status: 'exposed', declaredType: 'VARCHAR', sourceType: 'int4' });
    expect(describeElement(element.state, 'clear')).toMatchObject({ status: 'exposed', declaredType: 'INTEGER' });
    expect(describeElement(element.state, null)).toMatchObject({ status: 'undecided', declaredType: null });
    expect(describeElement(element.state, 'withheld')).toMatchObject({ status: 'withheld', declaredType: null });
    for (const treatment of [null, 'clear', 'tokenized'] as const) {
      expect(describeElement({ ...element.state, sourceType: 'geometry', duckdbType: null }, treatment))
        .toMatchObject({ status: 'unsupported_type', declaredType: null });
    }
    expect(postTreatmentType('INTEGER', 'aggregate_only')).toBe('INTEGER');
  });
});
