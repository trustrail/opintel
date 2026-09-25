import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { DevelopmentVaultAdapter, VaultRef, environmentVariableFor } from '../src/platform/vault/index.js';
import { ProjectId, ok, type Result } from '../src/shared/kernel/index.js';
import { IanaZoneResolver, SidecarTokenizer, TokenKey, TokenizationRun } from '../sidecar/tokenize/index.js';
import { tokenEventSchema } from '../sidecar/tokenize/telemetry.js';
import { caseFolding } from '../sidecar/tokenize/unicode/folding.js';
import { describeElement } from '../src/modules/catalog/index.js';

const bytes = () => Uint8Array.from({ length: 32 }, (_, index) => index);
const hex = Buffer.from(bytes()).toString('hex');
const projectId = ProjectId(randomUUID());
const ref = VaultRef(`vault://opintel/token-key/${projectId}`);
const vault = (value = hex) => new DevelopmentVaultAdapter({ [environmentVariableFor(ref)]: value });
const text = { domain: 'c', canonId: 'stdtext1', mode: 'text' };
const number = { domain: 'c', canonId: 'stdnum1', mode: 'number' };
const timestamp = { domain: 'c', canonId: 'stdtime1', mode: 'timestamp' };
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
function withRun<T>(work: (run: TokenizationRun) => T): T {
  const key = unwrap(TokenKey.take(bytes()));
  try { return work(new TokenizationRun(key, new IanaZoneResolver())); } finally { key.dispose(); }
}
const token = (input: unknown, config: unknown = text) => withRun(run => unwrap(run.tokenize(input, config)));

describe('tokenization execution contract', () => {
  it('TOK-03: repeats exactly across 10,000 calls', () => withRun(run => {
    const transform = unwrap(run.prepare(text));
    const first = transform('ACME');
    for (let i = 0; i < 10000; i++) expect(transform('ACME')).toEqual(first);
  }));
  it('TOK-04/TOK-05: NULL stays NULL; empty string is a value', () => {
    expect(token(null)).toBeNull(); expect(token('')).toMatch(/^v1_c_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it('TOK-06/TOK-07/TOK-08/TOK-34: explicit trim, full folding and NFKC', () => {
    expect(token(' ACME ')).toBe(token('acme'));
    expect(token(' ACME ', { ...text, caseInsensitive: false })).not.toBe(token('acme', { ...text, caseInsensitive: false }));
    expect(token('ＳＴＲＡＳＳＥ')).toBe(token('Straße'));
    expect(token('\ufeffacme\u0085')).toBe(token('acme'));
    expect(token('acme\u001f')).not.toBe(token('acme'));
    expect(token('\u01f0')).toBe(token('j\u030c'));
  });
  it('TOK-09: exact numeric strings; no loss of precision or text identity', () => {
    expect(token('7', number)).toBe(token('7.000', number));
    expect(token('-0.000', number)).toBe(token('0', number));
    expect(token('007')).not.toBe(token('7'));
    expect(token('1234567890123456789012345678901234567890', number)).not.toBe(token('1234567890123456789012345678901234567891', number));
    for (const value of ['007', '1e2', '1_000', '100.', '.5', '7\n', 7]) expect(withRun(run => run.tokenize(value, number)).ok).toBe(false);
  });
  it('TOK-11/TOK-32: full width and cryptographic domain separation', () => {
    const a = token('ACME')!; const b = token('ACME', { ...text, domain: 't' })!;
    expect(a).toMatch(/^v1_c_[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    expect(a.split('_')[2]).not.toBe(b.split('_')[2]);
  });
  it('TOK-02/TOK-18: project keys separate tokens and defeat the wrong-key dictionary', async () => {
    const other = ProjectId(randomUUID()); const requested: string[] = [];
    const tokenizer = new SidecarTokenizer({ resolveBytes: async keyRef => {
      requested.push(keyRef); return keyRef.endsWith(projectId) ? bytes() : new Uint8Array(32).fill(91);
    } }, new IanaZoneResolver());
    const dictionary = async (id: typeof projectId) => unwrap(await tokenizer.run(id, run => ok(['a', 'b', 'c'].map(value => unwrap(run.tokenize(value, text))))));
    const first = await dictionary(projectId); const second = await dictionary(other);
    expect(first.every(value => !second.includes(value))).toBe(true);
    expect(requested).toEqual([ref, `vault://opintel/token-key/${other}`]);
  });
  it('TOK-13: no key means refusal, never an unkeyed fallback', async () => {
    const work = vi.fn(); const tokenizer = new SidecarTokenizer(new DevelopmentVaultAdapter({}), new IanaZoneResolver());
    expect(await tokenizer.run(projectId, work)).toMatchObject({ ok: false, error: { code: 'dependency_unavailable' } });
    expect(work).not.toHaveBeenCalled();
  });
  it('TOK-14: the nominal key redacts all serialization and consumes its input', () => {
    const input = bytes(); const key = unwrap(TokenKey.take(input));
    expect(input.every(value => value === 0)).toBe(true);
    expect(String(key)).toBe('[REDACTED TOKEN KEY]');
    expect(JSON.stringify(key)).toBe('"[REDACTED TOKEN KEY]"');
    expect(inspect(key)).toBe('[REDACTED TOKEN KEY]');
    key.dispose(); expect(key.digest(Buffer.from('x')).ok).toBe(false);
  });
  it('strict Vault decoding names only the reference', async () => {
    expect(await vault().resolveBytes(ref)).toEqual(Buffer.from(bytes()));
    for (const value of [hex.toUpperCase(), hex + '00', hex.slice(2), 'g'.repeat(64), Buffer.from(bytes()).toString('base64'), '', ' ' + hex, hex + '\n', hex + '\r\n']) {
      await expect(vault(value).resolveBytes(ref)).rejects.toMatchObject({ message: `Secret ${ref} must contain exactly 64 lowercase hexadecimal characters.` });
    }
  });
  it('TOK-15/TOK-36: full runs capture every console channel and stdout/stderr without key or token leakage', async () => {
    const output: string[] = [];
    const capture = (...args: unknown[]) => { output.push(inspect(args)); };
    const logs = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'].map(method => vi.spyOn(console, method as 'log').mockImplementation(capture));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { output.push(Buffer.from(chunk).toString()); return true; });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => { output.push(Buffer.from(chunk).toString()); return true; });
    let produced: string | null = null;
    try {
      const tokenizer = new SidecarTokenizer(vault(), new IanaZoneResolver());
      const response = await tokenizer.run(projectId, run => run.tokenize('SECRET SOURCE VALUE', text));
      produced = unwrap(response);
      await tokenizer.run(projectId, run => run.tokenize(12, number));
      const failing = new SidecarTokenizer({ resolveBytes: async () => { throw new Error(hex); } }, new IanaZoneResolver());
      const failure = await failing.run(projectId, run => run.tokenize('x', text));
      console.error(failure);
      const key = unwrap(TokenKey.take(bytes())); console.log(key); key.dispose();
    } finally { logs.forEach(log => log.mockRestore()); stdout.mockRestore(); stderr.mockRestore(); }
    expect(output.join('\n')).toContain('tokenization.complete');
    expect(output.join('\n')).not.toContain('SECRET SOURCE VALUE');
    for (const secret of [Buffer.from(bytes()).toString(), hex, Buffer.from(bytes()).toString('base64'), produced!]) expect(output.join('\n')).not.toContain(secret);
    const allowed = { event: 'tokenization.complete', projectId };
    for (const field of ['token', 'key', 'value', 'sql', 'exception']) expect(tokenEventSchema.safeParse({ ...allowed, [field]: 'sensitive' }).success).toBe(false);
  });
  it('TOK-17: describe declares VARCHAR for a tokenized integer', () => {
    expect(describeElement({ id: 'element', sourceIdentifier: 'id', sourceType: 'integer', exposedName: 'id', exposedType: 'INTEGER', status: 'active' } as Parameters<typeof describeElement>[0], 'tokenized').declaredType).toBe('VARCHAR');
  });
  it('TOK-19/TOK-21/TOK-22/TOK-35: temporal declarations, grammar and DST refusal', () => {
    for (const input of ['2026-09-21T11:30:00', '1790000000', '2026-09-21', '2026-09-21T00:00:00Z\n']) expect(withRun(run => run.tokenize(input, timestamp)).ok).toBe(false);
    const zone = { ...timestamp, declaredZone: 'America/New_York' };
    for (const input of ['2026-11-01T01:30:00', '2026-03-08T02:30:00']) expect(withRun(run => run.tokenize(input, zone)).ok).toBe(false);
    expect(token('0', { ...timestamp, epochUnit: 'seconds' })).toBe(token('1970-01-01T00:00:00Z', timestamp));
    expect(token('-1', { ...timestamp, epochUnit: 'milliseconds' })).toBe(token('1969-12-31T23:59:59.999000Z', timestamp));
    expect(token('2026-09-21', { ...text, canonId: 'stddate1', mode: 'date' })).not.toBe(token('2026-09-21T00:00:00Z', timestamp));
    expect(token('2026-09-21T00:00:00.000001Z', timestamp)).not.toBe(token('2026-09-21T00:00:00.000002Z', timestamp));
  });
  it('TOK-20: explicit zone is independent of process TZ', () => {
    const program = `import {TokenKey,TokenizationRun,IanaZoneResolver} from './sidecar/tokenize/index.ts';
      const key=TokenKey.take(Uint8Array.from({length:32},(_,i)=>i));
      const run=new TokenizationRun(key.value,new IanaZoneResolver());
      console.log(JSON.stringify(run.tokenize('2026-09-21T11:30:00.123456',{domain:'c',canonId:'stdtime1',mode:'timestamp',declaredZone:'America/New_York'})));key.value.dispose();`;
    const results = ['America/Los_Angeles', 'Asia/Tokyo'].map(TZ => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], { env: { ...process.env, TZ }, encoding: 'utf8' }));
    expect(results[0]).toBe(results[1]); expect(JSON.parse(results[0]!)).toMatchObject({ ok: true });
  });
  it('TOK-23/TOK-26: a declared extension runs first and its version enters the MAC', () => withRun(run => {
    const raw = '１２, Jln Ampang'; const seen: string[] = [];
    const extension = { canonId: 'addr2', canonicalise: (input: string) => { seen.push(input); return input === raw ? '12 Jalan Ampang' : input; } };
    const config = { ...text, canonId: 'addr2' };
    expect(run.tokenize(raw, config, extension)).toEqual(run.tokenize('12 Jalan Ampang', config, extension));
    expect(seen[0]).toBe(raw);
    expect(run.tokenize(raw, text)).not.toEqual(run.tokenize('12 Jalan Ampang', text));
    expect(run.tokenize('12 Jalan Ampang', config, extension)).not.toEqual(run.tokenize('12 Jalan Ampang', text));
  }));
  it('TOK-33 execution validation rejects delimiter injection and malformed identifiers', () => {
    for (const field of ['domain', 'canonId']) for (const value of ['', 'a_b', 'a\0b', 'ABC', 'c\n']) expect(withRun(run => run.tokenize('x', { ...text, [field]: value })).ok).toBe(false);
  });
  it('the committed fold map contains exactly Unicode C/F entries', () => {
    const expected = new Map<string, string>();
    for (const line of readFileSync(new URL('../sidecar/tokenize/unicode/CaseFolding.txt', import.meta.url), 'utf8').split('\n')) {
      const match = /^([0-9A-F]+); ([CF]); ([0-9A-F ]+);/u.exec(line);
      if (match) expected.set(String.fromCodePoint(parseInt(match[1]!, 16)), match[3]!.split(' ').map(value => String.fromCodePoint(parseInt(value, 16))).join(''));
    }
    expect(caseFolding).toEqual(expected);
  });
});
