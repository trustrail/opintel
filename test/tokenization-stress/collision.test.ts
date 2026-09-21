import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { IanaZoneResolver, SidecarTokenizer } from '../../sidecar/tokenize/index.js';
import { ProjectId, ok } from '../../src/shared/kernel/index.js';

it('TOK-12: ten million distinct inputs produce ten million distinct complete tokens', async () => {
  const count = 10_000_000;
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const prefix = (token: string): bigint => {
    const body = token.slice('v1_c_'.length);
    let high = 0, low = 0;
    for (let i = 0; i < 6; i++) high = high * 32 + alphabet.indexOf(body[i]!);
    for (let i = 6; i < 12; i++) low = low * 32 + alphabet.indexOf(body[i]!);
    return BigInt(high) * 1073741824n + BigInt(low);
  };
  const tokenizer = new SidecarTokenizer({ resolveBytes: async () => Uint8Array.from({ length: 32 }, (_, i) => i) }, new IanaZoneResolver());
  const result = await tokenizer.run(ProjectId(randomUUID()), run => {
    const prepared = run.prepare({ domain: 'c', canonId: 'stdnum1', mode: 'number' });
    if (!prepared.ok) return prepared;
    const tokenize = (i: number): string => {
      const result = prepared.value(String(i));
      if (!result.ok || result.value === null) throw new Error('Collision probe input refused.');
      return result.value;
    };
    // Unique 60-bit prefixes prove unique full tokens. Retain 80MB rather than
    // ten million JS strings. If prefixes collide, compare their FULL tokens;
    // truncating for this storage optimization must never create a false failure.
    const prefixes = new BigUint64Array(count);
    for (let i = 0; i < count; i++) prefixes[i] = prefix(tokenize(i));
    prefixes.sort();
    const candidates = new Set<bigint>();
    for (let i = 1; i < count; i++) if (prefixes[i] === prefixes[i - 1]) candidates.add(prefixes[i]!);
    const full = new Set<string>();
    let collisions = 0;
    if (candidates.size > 0) for (let i = 0; i < count; i++) {
      const token = tokenize(i);
      if (!candidates.has(prefix(token))) continue;
      if (full.has(token)) collisions++;
      full.add(token);
    }
    return ok({ count, collisions });
  });
  expect(result).toEqual({ ok: true, value: { count, collisions: 0 } });
}, 600000);
