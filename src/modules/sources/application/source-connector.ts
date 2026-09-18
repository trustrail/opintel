import type { DomainError, ElementId, ObjectId, ProjectId, Result, SourceId, Timestamp } from '../../../shared/kernel/index.js';
import type { VaultRef } from '../../../platform/vault/types.js';

export type SourceKind = 'postgres' | 'demo';
export type ObjectRef = { id: ObjectId; sourceId: SourceId; schema: string; name: string };
export type TopValue = { value: string; frequency: number };
export type CatalogSnapshot = {
  takenAt: Timestamp;
  objects: Array<{
    schema: string; name: string; kind: 'table' | 'view' | 'fileset'; rowEstimate: number | null;
    columns: Array<{
      sourceIdentifier: string; stableRef: string | null; ordinal: number;
      sourceType: string; nullable: boolean; isKey: boolean; description: string | null;
    }>;
  }>;
  foreignKeys: Array<{ fromObject: string; fromColumn: string; toObject: string; toColumn: string }>;
};

export interface SourceConnector {
  readonly kind: SourceKind;
  testConnection(ref: VaultRef): Promise<Result<void, DomainError>>;
  introspect(ref: VaultRef, include: string[]): Promise<Result<CatalogSnapshot, DomainError>>;
  sampleTopValues(ref: VaultRef, elements: ElementId[], limit: number): Promise<Result<Map<ElementId, TopValue[]>, DomainError>>;
  estimateRowCount(ref: VaultRef, object: ObjectRef): Promise<Result<number | null, DomainError>>;
}

// The application binds a connector to a source and supplies current consent
// and catalogue addresses. Resolving these never contacts the source database.
export interface SourceConnectorContext {
  projectId: ProjectId;
  sourceId: SourceId;
  requestId: string;
  sampling(elements: ElementId[]): Promise<Result<{
    consentGiven: boolean;
    elements: Array<{ elementId: ElementId; object: string; column: string }>;
  }, DomainError>>;
}
