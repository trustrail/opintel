import { builtins } from './builtins.js';
import { createCanonicaliserRegistry } from './registry.js';
// Slice 1 ships no domain extensions. Add reviewed modules and their vectors
// here; the registry-wide determinism suite covers every entry automatically.
export const canonicalisers = createCanonicaliserRegistry(builtins);
export { createCanonicaliserRegistry, type CanonicaliserRegistry, type RegisteredCanonicaliser } from './registry.js';
