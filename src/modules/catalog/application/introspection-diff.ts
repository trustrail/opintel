import { CatalogObject, type CatalogChange } from '../domain/catalog.js';
import { mapSourceType, type DuckDbType } from '../domain/type-mapping.js';
import { CatalogNaming } from './naming.js';
import { DomainError, ok, err, type IdFactory, type ObjectId, type SourceId, type ProjectId, type Result } from '../../../shared/kernel/index.js';
import type { CatalogSnapshot } from '../../sources/index.js';

export type IntrospectionDiff = (CatalogChange | {
  type: 'CatalogObjectAdded' | 'CatalogObjectRemoved' | 'CatalogObjectRestored' | 'CatalogElementRestored' | 'CatalogElementChanged' | 'CatalogElementTypeChanged' | 'CatalogElementTypeFamilyChanged';
  projectId: ProjectId; objectId: ObjectId; elementId?: CatalogChange['elementId'];
  beforeType?: string; afterType?: string; requiresEntitlementDeletion?: true;
}) & { duckdbName?: string | null; before?: string | null; after?: string | null };
function family(type: DuckDbType | null, sourceType: string): string {
  if (type === null) return `unsupported:${sourceType}`;
  if (/^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|FLOAT|DOUBLE|DECIMAL)/u.test(type)) return 'number';
  if (type.startsWith('LIST(')) return 'list';
  if (type.startsWith('STRUCT(')) return 'struct';
  if (type === 'TIMESTAMPTZ') return 'TIMESTAMP';
  return type;
}
/** Stages the entire catalogue in memory. No caller-owned aggregate is mutated. */
export function reconcileSnapshot(existing: readonly CatalogObject[], snapshot: CatalogSnapshot,
  source: { id: SourceId; projectId: ProjectId }, naming: CatalogNaming, ids: IdFactory, adoptRenamedNames = false,
): Result<{ objects: CatalogObject[]; diff: IntrospectionDiff[] }> {
  const objects: CatalogObject[] = [];
  const diff: IntrospectionDiff[] = [];
  const seen = new Set<ObjectId>();
  const staged = new Set<string>();
  const schemaNames = new Map(existing.map((object) => [object.state.schemaName, object.state.duckdbSchema]));
  for (const discovered of snapshot.objects) {
    const key = JSON.stringify([discovered.schema, discovered.name]);
    if (staged.has(key)) return err(new DomainError('validation_failed', 'Duplicate catalogue object in snapshot.'));
    staged.add(key);
    const old = existing.find((object) => object.state.schemaName === discovered.schema && object.state.objectName === discovered.name);
    let object: CatalogObject;
    if (old !== undefined) {
      const copy = CatalogObject.create({ ...old.state, status: 'active', rowEstimate: discovered.rowEstimate, kind: discovered.kind }, old.elements);
      if (!copy.ok) return copy;
      object = copy.value;
      seen.add(old.state.id);
      if (old.state.status === 'removed') diff.push({ type: 'CatalogObjectRestored', projectId: source.projectId, objectId: old.state.id });
    } else {
      const schema = schemaNames.get(discovered.schema) ?? naming.assign(discovered.schema, [...schemaNames.values()]).name;
      if (schema === null) return err(new DomainError('validation_failed', 'A source schema has no usable exposed name.'));
      schemaNames.set(discovered.schema, schema);
      const reserved = [...existing, ...objects].filter((entry) => entry.state.duckdbSchema === schema).map((entry) => entry.state.duckdbName);
      const name = naming.assign(discovered.name, reserved);
      if (name.name === null) return err(new DomainError('validation_failed', 'A source object has no usable exposed name.'));
      const created = CatalogObject.create({ id: ids.create<ObjectId>(), sourceId: source.id, projectId: source.projectId,
        schemaName: discovered.schema, objectName: discovered.name, kind: discovered.kind, duckdbSchema: schema,
        duckdbName: name.name, lineageKnown: discovered.kind === 'table', rowEstimate: discovered.rowEstimate, description: null, status: 'active' });
      if (!created.ok) return created;
      object = created.value;
      diff.push({ type: 'CatalogObjectAdded', projectId: source.projectId, objectId: object.state.id });
      if (name.collision) diff.push({ type: 'CatalogNameCollision', projectId: source.projectId, objectId: object.state.id });
    }
    const changes = object.reconcile(discovered.columns.map((column) => ({ ...column, duckdbType: mapSourceType(column.sourceType) })), naming.elementIdentity(ids), snapshot.takenAt);
    if (!changes.ok) return changes;
    diff.push(...changes.value);
    for (const current of object.elements) {
      const prior = old?.elements.find((element) => element.state.id === current.state.id)?.state;
      const next = current.state;
      if (prior === undefined || next.status === 'removed') continue;
      if (adoptRenamedNames && prior.sourceIdentifier !== next.sourceIdentifier) {
        const assigned = naming.assign(next.sourceIdentifier, object.elements.flatMap((element) =>
          element.state.id !== next.id && element.state.duckdbName !== null ? [element.state.duckdbName] : []));
        if (assigned.name === null) return err(new DomainError('validation_failed', 'The renamed element has no usable exposed name.'));
        const adopted = object.adoptRenamedName(assigned.name, next.id);
        if (!adopted.ok) return adopted;
        diff.push(...adopted.value);
        if (assigned.collision) diff.push({ type: 'CatalogNameCollision', projectId: source.projectId, objectId: object.state.id, elementId: next.id });
      }
      if (prior.status === 'removed') diff.push({ type: 'CatalogElementRestored', projectId: source.projectId, objectId: object.state.id, elementId: next.id });
      if (prior.sourceType !== next.sourceType || prior.duckdbType !== next.duckdbType) {
        const changedFamily = family(prior.duckdbType, prior.sourceType) !== family(next.duckdbType, next.sourceType);
        diff.push({ type: changedFamily ? 'CatalogElementTypeFamilyChanged' : 'CatalogElementTypeChanged',
          projectId: source.projectId, objectId: object.state.id, elementId: next.id,
          beforeType: prior.sourceType, afterType: next.sourceType, ...(changedFamily ? { requiresEntitlementDeletion: true as const } : {}) });
      }
      if (prior.nullable !== next.nullable || prior.isKey !== next.isKey || prior.description !== next.description) {
        diff.push({ type: 'CatalogElementChanged', projectId: source.projectId, objectId: object.state.id, elementId: next.id });
      }
    }
    objects.push(object);
  }
  for (const old of existing) {
    if (seen.has(old.state.id)) continue;
    const copy = CatalogObject.create({ ...old.state, status: 'removed' }, old.elements);
    if (!copy.ok) return copy;
    const changes = copy.value.reconcile([], naming.elementIdentity(ids), snapshot.takenAt);
    if (!changes.ok) return changes;
    if (old.state.status === 'active') diff.push({ type: 'CatalogObjectRemoved', projectId: source.projectId, objectId: old.state.id });
    diff.push(...changes.value);
    objects.push(copy.value);
  }
  // Preserve display facts with the run; later catalogue changes must not rewrite history.
  for (const entry of diff) {
    const oldObject = existing.find(object => object.state.id === entry.objectId);
    const newObject = objects.find(object => object.state.id === entry.objectId);
    const oldElement = oldObject?.elements.find(element => element.state.id === entry.elementId)?.state;
    const newElement = newObject?.elements.find(element => element.state.id === entry.elementId)?.state;
    entry.duckdbName = entry.elementId ? newElement?.duckdbName ?? oldElement?.duckdbName ?? null : newObject?.state.duckdbName ?? oldObject?.state.duckdbName ?? null;
    if (entry.type === 'CatalogElementRenamed') { entry.before = oldElement?.sourceIdentifier ?? null; entry.after = newElement?.sourceIdentifier ?? null; }
    if (entry.type === 'CatalogNameAdopted') { entry.before = oldElement?.duckdbName ?? null; entry.after = newElement?.duckdbName ?? null; }
  }
  return ok({ objects, diff });
}
