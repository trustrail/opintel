import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IanaZoneResolver, TokenKey, TokenizationRun } from '../sidecar/tokenize/index.js';

const vectors = z.array(z.object({
  name: z.string(), input: z.union([z.string(), z.number(), z.null()]),
  domain: z.string(), canonId: z.string(), caseInsensitive: z.boolean(),
  mode: z.enum(['text', 'number', 'date', 'timestamp']), declaredZone: z.string().nullable(),
  expectError: z.boolean(), token: z.string().nullable(),
})).parse(JSON.parse(readFileSync(new URL('../sidecar/tokenize/reference/vectors.json', import.meta.url), 'utf8')));

describe('TOK-31 independent reference vectors', () => {
  it('contains all 43 vectors, including 14 rejections', () => {
    expect(vectors).toHaveLength(43);
    expect(vectors.filter(vector => vector.expectError)).toHaveLength(14);
  });
  it.each(vectors)('$name', ({ input, expectError, token, name: _name, ...config }) => {
    const key = TokenKey.take(Uint8Array.from({ length: 32 }, (_, index) => index));
    if (!key.ok) throw new Error('Invalid test key.');
    try {
      if(config.domain==='sentinel'){expect(input).toBe('opintel-sentinel');expect(config).toMatchObject({mode:'text',canonId:'stdtext1',caseInsensitive:false,declaredZone:null});}
      const result = (config.domain === 'sentinel' ? new TokenizationRun(key.value, new IanaZoneResolver()).sentinel() : new TokenizationRun(key.value, new IanaZoneResolver()).tokenize(input, config));
      if (expectError) expect(result.ok).toBe(false);
      else expect(result).toEqual({ ok: true, value: token });
    } finally { key.value.dispose(); }
  });
});
