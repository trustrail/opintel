import { CatalogObject, CatalogElement, type CatalogObjectState, type ElementState } from '../domain/catalog.js';
import { ExposedName, Timestamp, InvariantViolation, DomainError, err, type Result } from '../../../shared/kernel/index.js';

export type CatalogObjectRow = Omit<CatalogObjectState, 'exposedName' | 'exposedSchema'> & { exposedName: string; exposedSchema: string };
export type CatalogElementRow = Omit<ElementState, 'exposedName' | 'discoveredAt' | 'removedAt'> & {
  exposedName: string | null; discoveredAt: Date; removedAt: Date | null;
};
/** Database strings are untrusted: a generic query type is not brand validation. */
export function hydrateCatalogObject(row: CatalogObjectRow, elements: readonly CatalogElementRow[]): Result<CatalogObject> {
  try {
    return CatalogObject.create({ ...row, exposedName: ExposedName(row.exposedName), exposedSchema: ExposedName(row.exposedSchema) },
      elements.map(element => new CatalogElement({ ...element,
        exposedName: element.exposedName === null ? null : ExposedName(element.exposedName),
        discoveredAt: Timestamp(element.discoveredAt), removedAt: element.removedAt === null ? null : Timestamp(element.removedAt),
      })));
  } catch (error: unknown) {
    if (!(error instanceof InvariantViolation)) throw error;
    return err(new DomainError('validation_failed', `Stored catalogue names or timestamps for object ${row.id} are invalid. Repair the stored declarations before publishing its catalogue.`));
  }
}
