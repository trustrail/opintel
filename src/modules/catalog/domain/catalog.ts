import {
  DomainError, err, ok, type ExposedName, type ElementId, type ObjectId,
  type ProjectId, type Result, type SourceId, type Timestamp,
} from '../../../shared/kernel/index.js';
import type { ExposedType } from './type-mapping.js';

export type ElementDiscovery = Readonly<{
  ordinal?: number | null; sourceIdentifier: string; stableRef: string | null; sourceType: string; exposedType: ExposedType | null;
  nullable: boolean; isKey: boolean; description: string | null;
}>;
export type ElementState = ElementDiscovery & Readonly<{
  tokenDomain?: string | null; caseInsensitive?: boolean | null; canonId?: string | null;
  sourceTimezone?: string | null; schemaTimezone?: string | null; epochUnit?: 'seconds' | 'milliseconds' | null;
  id: ElementId; objectId: ObjectId; projectId: ProjectId; exposedName: ExposedName | null; nameRevision?: number;
  status: 'active' | 'removed'; discoveredAt: Timestamp; removedAt: Timestamp | null;
}>;

// State is frozen so callers cannot rename a field or discard its identity by
// mutating an entity obtained from the aggregate. Changes produce a new entity.
export class CatalogElement {
  readonly state: ElementState;
  constructor(state: ElementState) { this.state = Object.freeze({ ...state, nameRevision: state.nameRevision ?? 0 }); }
}

export type CatalogObjectState = Readonly<{
  id: ObjectId; sourceId: SourceId; projectId: ProjectId;
  schemaName: string; objectName: string; kind: 'table' | 'view' | 'fileset';
  exposedSchema: ExposedName; exposedName: ExposedName; nameRevision?: number;
  lineageKnown: boolean; rowEstimate: number | null; description: string | null;
  status: 'active' | 'removed';
}>;
export type CatalogChange = Readonly<{
  type: 'CatalogElementAdded' | 'CatalogElementRenamed' | 'CatalogElementRemoved'
    | 'CatalogObjectRenamed' | 'CatalogNameCollision' | 'CatalogElementUnnameable' | 'CatalogNameAdopted';
  projectId: ProjectId; objectId: ObjectId; elementId?: ElementId; breaking?: true;
}>;
export type AssignElementIdentity = (
  discovery: ElementDiscovery, reservedNames: readonly ExposedName[],
) => Result<{ id: ElementId; exposedName: ExposedName | null; collision?: boolean }, DomainError>;

export class CatalogObject {
  private objectState: CatalogObjectState;
  private current: readonly CatalogElement[];

  private constructor(state: CatalogObjectState, elements: readonly CatalogElement[]) {
    this.objectState = Object.freeze({ ...state, nameRevision: state.nameRevision ?? 0 });
    this.current = Object.freeze([...elements]);
  }

  static create(state: CatalogObjectState, elements: readonly CatalogElement[] = []): Result<CatalogObject, DomainError> {
    if (elements.some(({ state: element }) => element.objectId !== state.id || element.projectId !== state.projectId)) {
      return err(new DomainError('validation_failed', 'An element must belong to its catalogue object and project.'));
    }
    const valid = validateElements(elements);
    return valid.ok ? ok(new CatalogObject(state, elements)) : valid;
  }

  get state(): CatalogObjectState { return this.objectState; }

  get elements(): readonly CatalogElement[] { return this.current; }

  renameSource(schemaName: string, objectName: string): Result<readonly CatalogChange[], DomainError> {
    if (schemaName === this.state.schemaName && objectName === this.state.objectName) return ok([]);
    this.objectState = Object.freeze({ ...this.state, schemaName, objectName });
    return ok([{ type: 'CatalogObjectRenamed', projectId: this.state.projectId, objectId: this.state.id }]);
  }

  // Only this explicit command changes an existing exposed name. Item 3.6
  // authorizes the administrator and persists this revision with its diff.
  adoptRenamedName(name: ExposedName, elementId?: ElementId): Result<readonly CatalogChange[], DomainError> {
    if (elementId === undefined) {
      if (name === this.state.exposedName) return ok([]);
      this.objectState = Object.freeze({ ...this.state, exposedName: name, nameRevision: (this.state.nameRevision ?? 0) + 1 });
    } else {
      const element = this.current.find((entry) => entry.state.id === elementId);
      if (element === undefined) return err(new DomainError('not_found', 'The catalogue element does not exist.'));
      if (element.state.exposedName === name) return ok([]);
      if (this.current.some((entry) => entry.state.exposedName === name)) {
        return err(new DomainError('conflict', 'The exposed name is already assigned to another element.'));
      }
      this.current = Object.freeze(this.current.map((entry) => entry !== element ? entry : new CatalogElement({
        ...entry.state, exposedName: name, nameRevision: (entry.state.nameRevision ?? 0) + 1,
      })));
    }
    return ok([{ type: 'CatalogNameAdopted', projectId: this.state.projectId, objectId: this.state.id,
      ...(elementId === undefined ? {} : { elementId }), breaking: true }]);
  }

  // Pure aggregate reconciliation. Contacting a source, normalising names,
  // persistence and publishing these changes belong to later application items.
  reconcile(discovered: readonly ElementDiscovery[], assign: AssignElementIdentity, now: Timestamp): Result<readonly CatalogChange[], DomainError> {
    const identifiers = new Set<string>();
    const refs = new Set<string>();
    const matched = new Set<ElementId>();
    const changes: CatalogChange[] = [];
    const next: CatalogElement[] = [];
    const reservedNames = this.current.flatMap((element) => element.state.exposedName === null ? [] : [element.state.exposedName]);
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
        if (this.current.some((element) => element.state.id === identity.value.id) || (identity.value.exposedName !== null && reservedNames.includes(identity.value.exposedName))) {
          return err(new DomainError('conflict', 'A new element must have a new identity and an unused exposed name.'));
        }
        if (identity.value.exposedName !== null) reservedNames.push(identity.value.exposedName);
        next.push(new CatalogElement({
          ...discovery, id: identity.value.id, exposedName: identity.value.exposedName, objectId: this.state.id, projectId: this.state.projectId,
          status: 'active', discoveredAt: now, removedAt: null,
        }));
        change('CatalogElementAdded', identity.value.id);
        if (identity.value.collision) change('CatalogNameCollision', identity.value.id);
        if (identity.value.exposedName === null) change('CatalogElementUnnameable', identity.value.id);
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
  const names = new Set<ExposedName>();
  const identifiers = new Set<string>();
  const refs = new Set<string>();
  for (const { state } of elements) {
    if (ids.has(state.id) || (state.exposedName !== null && names.has(state.exposedName)) || identifiers.has(state.sourceIdentifier)
      || (state.stableRef !== null && refs.has(state.stableRef))) {
      return err(new DomainError('conflict', 'Catalogue element identities and names must be unique within an object.'));
    }
    ids.add(state.id);
    if (state.exposedName !== null) names.add(state.exposedName);
    identifiers.add(state.sourceIdentifier);
    if (state.stableRef !== null) refs.add(state.stableRef);
  }
  return ok(undefined);
}
