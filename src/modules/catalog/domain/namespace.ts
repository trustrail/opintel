import type { DuckDbName } from '../../../shared/kernel/index.js';
import type { CatalogObjectState } from './catalog.js';

export function exposedObjectName(sourceAlias: DuckDbName, object: CatalogObjectState): string {
  return `${sourceAlias}.${object.duckdbSchema}.${object.duckdbName}`;
}
