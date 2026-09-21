import type { CatalogNode } from '../../../shared/api/catalog.js';
import type { DomainError, ProjectId, Result, UserId } from '../../../shared/kernel/index.js';
export type CatalogContext = { projectId: ProjectId; userId: UserId };
export type TreeRead = { parent: string; prefix: string; after: string | null; limit: number };
export type TreeEntry = { node: CatalogNode; position: string };
export interface CatalogTreeReader {
  read(context: CatalogContext, query: TreeRead): Promise<Result<TreeEntry[], DomainError>>;
}
