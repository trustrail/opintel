import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CatalogObject, type ElementDiscovery, type AssignElementIdentity } from '../src/modules/catalog/index.js';
import { DuckDbName, ElementId, ObjectId, ProjectId, SourceId, Timestamp, ok } from '../src/shared/kernel/index.js';

const now = Timestamp(new Date('2026-01-01T00:00:00Z'));
const later = Timestamp(new Date('2026-01-02T00:00:00Z'));
const column = (name: string, stableRef: string | null = '1'): ElementDiscovery => ({
  sourceIdentifier: name, stableRef, sourceType: 'text', duckdbType: 'VARCHAR', nullable: true, isKey: false, description: null,
});
function object() {
  const result = CatalogObject.create({
    id: ObjectId(randomUUID()), sourceId: SourceId(randomUUID()), projectId: ProjectId(randomUUID()),
    schemaName: 'public', objectName: 'Orders', kind: 'table', duckdbSchema: DuckDbName('public'),
    duckdbName: DuckDbName('orders'), lineageKnown: true, rowEstimate: null, description: null, status: 'active',
  });
  if (!result.ok) throw result.error;
  return result.value;
}
const identity = (name: string) => ({ id: ElementId(randomUUID()), duckdbName: DuckDbName(name) });

describe('catalogue aggregate identity', () => {
  it('G-006: stable-reference rename retains identity and exposed name, and emits an identifier-only observation event', () => {
    const catalog = object();
    const assigned = identity('customer_name');
    expect(catalog.reconcile([column('Customer Name')], () => ok(assigned), now).ok).toBe(true);
    const assign = vi.fn<AssignElementIdentity>();
    expect(catalog.reconcile([column('Account Holder')], assign, later)).toEqual(ok([{
      type: 'CatalogElementRenamed', projectId: catalog.state.projectId, objectId: catalog.state.id, elementId: assigned.id,
    }]));
    expect(catalog.elements[0]?.state).toMatchObject({ ...assigned, sourceIdentifier: 'Account Holder', discoveredAt: now, status: 'active' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('G-007: without a stable reference, rename retains the removed entity and allocates a separate identity', () => {
    const catalog = object();
    const old = identity('old_name');
    const fresh = identity('new_name');
    catalog.reconcile([column('Old Name', null)], () => ok(old), now);
    const result = catalog.reconcile([column('New Name', null)], () => ok(fresh), later);
    expect(result).toEqual(ok([
      { type: 'CatalogElementAdded', projectId: catalog.state.projectId, objectId: catalog.state.id, elementId: fresh.id },
      { type: 'CatalogElementRemoved', projectId: catalog.state.projectId, objectId: catalog.state.id, elementId: old.id },
    ]));
    expect(catalog.elements.find((element) => element.state.id === old.id)?.state)
      .toMatchObject({ ...old, status: 'removed', discoveredAt: now, removedAt: later });
    expect(catalog.elements.find((element) => element.state.id === fresh.id)?.state)
      .toMatchObject({ ...fresh, status: 'active', discoveredAt: later, removedAt: null });
    // No entitlement is copied: the new element has a distinct identity.
    expect(fresh.id).not.toBe(old.id);
  });

  it('G-012: records the initially assigned normalised name and never asks for it again', () => {
    const catalog = object();
    const assign = vi.fn<AssignElementIdentity>().mockReturnValue(ok(identity('gross_written_premium')));
    catalog.reconcile([column('Gross Written Premium (€)')], assign, now);
    const before = catalog.elements;
    expect(catalog.reconcile([column('Gross Written Premium (€)')], assign, later)).toEqual(ok([]));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(catalog.elements).toEqual(before);
    expect(catalog.elements[0]?.state.duckdbName).toBe('gross_written_premium');
  });

  it('retains removed rows and reserves their exposed names without repeatedly emitting removal', () => {
    const catalog = object();
    const old = identity('reserved');
    catalog.reconcile([column('Old', null)], () => ok(old), now);
    catalog.reconcile([], () => ok(identity('unused')), later);
    const before = catalog.elements;
    const assign = vi.fn<AssignElementIdentity>().mockReturnValue(ok(identity('reserved')));
    expect(catalog.reconcile([column('New', null)], assign, later).ok).toBe(false);
    expect(assign.mock.calls[0]?.[1]).toContain(old.duckdbName);
    expect(catalog.elements).toEqual(before);
    expect(catalog.reconcile([], assign, later)).toEqual(ok([]));
    expect(catalog.elements).toEqual(before);
  });

  it('rejects duplicate discovery identities atomically', () => {
    const catalog = object();
    catalog.reconcile([column('Original')], () => ok(identity('original')), now);
    const before = catalog.elements;
    expect(catalog.reconcile([column('Renamed'), column('Duplicate')], () => ok(identity('unused')), later).ok).toBe(false);
    expect(catalog.elements).toEqual(before);
  });

  it('does not allow callers to mutate retained entity state or exposed names', () => {
    const catalog = object();
    catalog.reconcile([column('Original')], () => ok(identity('original')), now);
    expect(Object.isFrozen(catalog.state)).toBe(true);
    expect(Object.isFrozen(catalog.elements)).toBe(true);
    expect(Object.isFrozen(catalog.elements[0]?.state)).toBe(true);
  });
});
