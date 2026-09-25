import type { ExposedName } from '../../../shared/kernel/index.js';
import type { CatalogObjectState } from './catalog.js';

export function exposedObjectName(sourceAlias: ExposedName, object: CatalogObjectState): string {
  return `${sourceAlias}.${object.exposedSchema}.${object.exposedName}`;
}
