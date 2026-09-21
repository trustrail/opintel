import type { ProjectId, ElementId, Result } from '../../../shared/kernel/index.js';
/** Implemented by handwritten item 4.3. No key handling or canonicalisation here.
 * The adapter resolves the element's configured token domain and canonicaliser.
 * Source identity is not a token namespace: joins must work across sources.
 */
export interface TokenizerPort {
 tokenize(input: { projectId: ProjectId; elementId: ElementId; value: unknown }): Promise<Result<string | null>>;
}
