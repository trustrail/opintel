import { canonicalisers, createCanonicaliserRegistry } from '../../sidecar/tokenize/canonicalisers/index.js';
import { fixture1, fixture2 } from './canonicalisers/reviewed.js';
const registry = createCanonicaliserRegistry([...canonicalisers.entries,fixture1,fixture2]);
let data = '';
for await (const chunk of process.stdin) data += String(chunk);
const inputs = JSON.parse(data) as Record<string,string[]>;
process.stdout.write(JSON.stringify(registry.entries.map(entry => ({id:entry.canonId, outputs:inputs[entry.mode]!.map(input=>entry.canonicalise(input))}))));
