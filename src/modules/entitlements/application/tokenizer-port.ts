import type { ProjectId, ElementId, Result } from '../../../shared/kernel/index.js';
/** Treatment delegation contract only. Concrete tokenization runs in the sidecar
 * read boundary (4.3); the application never imports it or resolves its key.
 * The adapter resolves the element's configured token domain and canonicaliser.
 * Source identity is not a token namespace: joins must work across sources.
 */
export interface TokenizerPort {
 tokenize(input: { projectId: ProjectId; elementId: ElementId; value: unknown }): Promise<Result<string | null>>;
}
