import type { Canonicaliser } from '../config.js';
export type RegisteredCanonicaliser = Canonicaliser & {
  readonly mode: 'text' | 'number' | 'date' | 'timestamp';
  readonly vectors: readonly { readonly input: string; readonly output: string }[];
};
/** Build-time catalogue of reviewed modules, not a runtime submission API. */
export function createCanonicaliserRegistry(entries: readonly RegisteredCanonicaliser[]) {
  const map = new Map<string, RegisteredCanonicaliser>();
  for (const entry of entries) {
    if (!/^[a-z0-9]+$(?![\s\S])/u.test(entry.canonId) || !/[0-9]/u.test(entry.canonId)) throw new Error('A canonicaliser id must be lowercase alphanumeric and include its version.');
    if (!['stdtext1','stdnum1','stddate1','stdtime1'].includes(entry.canonId) && entry.mode !== 'text') throw new Error('Domain canonicalisers are text-mode extensions.');
    if (map.has(entry.canonId)) throw new Error('A canonicaliser id cannot be registered twice.');
    if (!entry.vectors.length) throw new Error('A canonicaliser must ship fixed input-to-output vectors.');
    map.set(entry.canonId, Object.freeze({ ...entry, vectors: Object.freeze(entry.vectors.map(v => Object.freeze({ ...v }))) }));
  }
  return Object.freeze({ ids: Object.freeze([...map.keys()].sort()), entries: Object.freeze([...map.values()]), get: (id: string) => map.get(id) });
}
export type CanonicaliserRegistry = ReturnType<typeof createCanonicaliserRegistry>;
