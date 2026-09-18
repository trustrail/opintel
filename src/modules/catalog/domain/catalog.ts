import {
  DomainError, err, ok, type DuckDbName, type ElementId, type ObjectId,
  type ProjectId, type Result, type SourceId, type Timestamp,
} from '../../../shared/kernel/index.js';

export type ElementDiscovery = Readonly<{
  sourceIdentifier: string; stableRef: string | null; sourceType: string; duckdbType: string;
  nullable: boolean; isKey: boolean; description: string | null;
}>;
export type ElementState = ElementDiscovery & Readonly<{
  id: ElementId; objectId: ObjectId; projectId: ProjectId; duckdbName: DuckDbName;
  status: 'active' | 'removed'; discoveredAt: Timestamp; removedAt: Timestamp | null;
}>;

// State is frozen so callers cannot rename a field or discard its identity by
// mutating an entity obtained from the aggregate. Changes produce a new entity.
export class CatalogElement {
  readonly state: ElementState;
  constructor(state: ElementState) { this.state = Object.freeze({ ...state }); }
}

export type CatalogObjectState = Readonly<{
  id: ObjectId; sourceId: SourceId; projectId: ProjectId;
  schemaName: string; objectName: string; kind: 'table' | 'view' | 'fileset';
  duckdbSchema: DuckDbName; duckdbName: DuckDbName;
  lineageKnown: boolean; rowEstimate: number | null; description: string | null;
  status: 'active' | 'removed';
}>;
export type CatalogChange = Readonly<{
  type: 'CatalogElementAdded' | 'CatalogElementRenamed' | 'CatalogElementRemoved';
  projectId: ProjectId; objectId: ObjectId; elementId: ElementId;
}>;
export type AssignElementIdentity = (
  discovery: ElementDiscovery, reservedNames: readonly DuckDbName[],
) => Result<{ id: ElementId; duckdbName: DuckDbName }, DomainError>;

export class CatalogObject {
  readonly state: CatalogObjectState;
  private current: readonly CatalogElement[];

  private constructor(state: CatalogObjectState, elements: readonly CatalogElement[]) {
    this.state = Object.freeze({ ...state });
    this.current = Object.freeze([...elements]);
  }

  static create(state: CatalogObjectState, elements: readonly CatalogElement[] = []): Result<CatalogObject, DomainError> {
    if (elements.some(({ state: element }) => element.objectId !== state.id || element.projectId !== state.projectId)) {
      return err(new DomainError('validation_failed', 'An element must belong to its catalogue object and project.'));
    }
    const valid = validateElements(elements);
    return valid.ok ? ok(new CatalogObject(state, elements)) : valid;
  }

  get elements(): readonly CatalogElement[] { return this.current; }

  // Pure aggregate reconciliation. Contacting a source, normalising names,
  // persistence and publishing these changes belong to later application items.
  reconcile(discovered: readonly ElementDiscovery[], assign: AssignElementIdentity, now: Timestamp): Result<readonly CatalogChange[], DomainError> {
    const identifiers = new Set<string>();
    const refs = new Set<string>();
    const matched = new Set<ElementId>();
    const changes: CatalogChange[] = [];
    const next: CatalogElement[] = [];
    const reservedNames = this.current.map((element) => element.state.duckdbName);
    const change = (type: CatalogChange['type'], elementId: ElementId): void => {
      changes.push({ type, projectId: this.state.projectId, objectId: this.state.id, elementId });
    };
    for (const discovery of discovered) {
      if (identifiers.has(discovery.sourceIdentifier) || (discovery.stableRef !== null && refs.has(discovery.stableRef))) {
        return err(new DomainError('validation_failed', 'Discovered elements must have distinct source identifiers and stable references.'));
      }
      identifiers.add(discovery.sourceIdentifier);
      if (discovery.stableRef !== null) refs.add(discovery.stableRef);
      const existing = this.current.find(({ state }) => discovery.stableRef === null
        ? state.stableRef === null && state.sourceIdentifier === discovery.sourceIdentifier
        : state.stableRef === discovery.stableRef);
      if (existing !== undefined) {
        matched.add(existing.state.id);
        if (existing.state.sourceIdentifier !== discovery.sourceIdentifier) change('CatalogElementRenamed', existing.state.id);
        next.push(new CatalogElement({ ...existing.state, ...discovery, status: 'active', removedAt: null }));
      } else {
        // This callback is never invoked for an existing identity: names cannot
        // drift when a naming algorithm changes or a source column is renamed.
        const identity = assign(discovery, Object.freeze([...reservedNames]));
        if (!identity.ok) return identity;
        if (this.current.some((element) => element.state.id === identity.value.id) || reservedNames.includes(identity.value.duckdbName)) {
          return err(new DomainError('conflict', 'A new element must have a new identity and an unused exposed name.'));
        }
        reservedNames.push(identity.value.duckdbName);
        next.push(new CatalogElement({
          ...discovery, ...identity.value, objectId: this.state.id, projectId: this.state.projectId,
          status: 'active', discoveredAt: now, removedAt: null,
        }));
        change('CatalogElementAdded', identity.value.id);
      }
    }
    for (const element of this.current) {
      if (matched.has(element.state.id)) continue;
      if (element.state.status === 'active') change('CatalogElementRemoved', element.state.id);
      next.push(element.state.status === 'removed' ? element : new CatalogElement({ ...element.state, status: 'removed', removedAt: now }));
    }
    const valid = validateElements(next);
    if (!valid.ok) return valid;
    this.current = Object.freeze(next);
    return ok(Object.freeze(changes));
  }
}

function validateElements(elements: readonly CatalogElement[]): Result<void, DomainError> {
  const ids = new Set<ElementId>();
  const names = new Set<DuckDbName>();
  const identifiers = new Set<string>();
  const refs = new Set<string>();
  for (const { state } of elements) {
    if (ids.has(state.id) || names.has(state.duckdbName) || identifiers.has(state.sourceIdentifier)
      || (state.stableRef !== null && refs.has(state.stableRef))) {
      return err(new DomainError('conflict', 'Catalogue element identities and names must be unique within an object.'));
    }
    ids.add(state.id); names.add(state.duckdbName); identifiers.add(state.sourceIdentifier);
    if (state.stableRef !== null) refs.add(state.stableRef);
  }
  return ok(undefined);
}
