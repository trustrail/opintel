import { canonicalise } from '../canonicalise.js';
import type { RegisteredCanonicaliser } from './registry.js';
// Built-ins delegate to the construction already verified by item 4.3. They
// are not text-mode extensions and must not be applied a second time.
function builtin(canonId: string, mode: RegisteredCanonicaliser['mode'], vectors: RegisteredCanonicaliser['vectors']): RegisteredCanonicaliser {
  return { canonId, mode, vectors, canonicalise(raw) {
    const result = canonicalise(raw, { canonId, mode, domain: 'check', caseInsensitive: true }, { toUtc() { throw new Error('A built-in vector must supply an explicit timestamp offset.'); } });
    if (!result.ok || result.value === null) throw new Error('Invalid canonicaliser input.');
    return result.value;
  } };
}
export const builtins: readonly RegisteredCanonicaliser[] = [
  builtin('stdtext1', 'text', [{input:'  Straße\ufeff',output:'strasse'},{input:'ＡＣＭＥ',output:'acme'},{input:'',output:''}]),
  builtin('stdnum1', 'number', [{input:'100.000',output:'100'},{input:'-0.00',output:'0'},{input:'12345678901234567890.0100',output:'12345678901234567890.01'}]),
  builtin('stddate1', 'date', [{input:'2024-02-29',output:'2024-02-29'},{input:'2000-01-01',output:'2000-01-01'}]),
  builtin('stdtime1', 'timestamp', [{input:'2026-09-21T12:00:00+02:00',output:'2026-09-21T10:00:00.000000Z'},{input:'2026-09-21T10:00:00.123456Z',output:'2026-09-21T10:00:00.123456Z'}]),
];
