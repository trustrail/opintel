import type { ElementState } from './catalog.js';
import { postTreatmentType, type Treatment } from './type-mapping.js';

// The future describe handler consumes this post-treatment metadata; this does
// not compile views or implement tokenization.
export function describeElement(element: ElementState, treatment: Treatment | null) {
  const status = element.status === 'removed' ? 'removed'
    : element.exposedName === null ? 'unnameable'
      : element.exposedType === null ? 'unsupported_type'
        : treatment === null ? 'undecided' : treatment === 'withheld' ? 'withheld' : 'exposed';
  return {
    id: element.id, sourceIdentifier: element.sourceIdentifier, sourceType: element.sourceType,
    exposedName: element.exposedName, status,
    declaredType: status === 'exposed' ? postTreatmentType(element.exposedType, treatment) : null,
  };
}
