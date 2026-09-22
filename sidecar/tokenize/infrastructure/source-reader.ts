import { canonicalisers, type CanonicaliserRegistry } from '../canonicalisers/index.js';
import { z } from 'zod';
import { DomainError, ProjectId, err, ok, type Result } from '../../../src/shared/kernel/index.js';
import { VaultRef } from '../../../src/platform/vault/index.js';
import type { PostgresSourceScope } from '../../infrastructure/postgres-source-scope.js';
import type { SidecarTokenizer } from '../tokenizer.js';
import { tokenConfigSchema } from '../config.js';

const identifier = z.string().min(1).refine(value => !value.includes('\0'));
const readSchema = z.strictObject({
  projectId: z.uuid(), sourceId: z.uuid(), credentialRef: z.string().startsWith('vault://'),
  schema: identifier, object: identifier,
  columns: z.array(z.strictObject({ name: identifier, config: tokenConfigSchema })).min(1)
    .refine(columns => new Set(columns.map(column => column.name)).size === columns.length),
});
export type TokenizedRead = z.input<typeof readSchema>;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const modes: Readonly<Record<string, string>> = {
  text: 'text', varchar: 'text', bpchar: 'text', uuid: 'text',
  int2: 'number', int4: 'number', int8: 'number', numeric: 'number',
  date: 'date', timestamp: 'timestamp', timestamptz: 'timestamp',
};
const refused = () => err(new DomainError('validation_failed',
  'A source column cannot use its declared tokenization mode. Check the declaration; cast floating-point columns upstream to numeric.'));

/** Read-boundary library for the future query executor. Only treated rows reach
 * the consumer; no DuckDB session or SQL function receives the key or plaintext.
 * The existing source scope owns credentials, read-only transactions and aborts. */
export class TokenizedSourceReader {
  constructor(private readonly scope: Pick<PostgresSourceScope, 'run'>, private readonly tokenizer: SidecarTokenizer, private readonly registry: CanonicaliserRegistry = canonicalisers) {}

  async read(input: unknown, consume: (row: Readonly<Record<string, string | null>>) => Promise<void>,
    signal?: AbortSignal): Promise<Result<number>> {
    const parsed = readSchema.safeParse(input);
    if (!parsed.success) return err(new DomainError('validation_failed', 'The tokenized source read declaration is invalid.'));
    const request = parsed.data;
    return this.tokenizer.run(ProjectId(request.projectId), async run => {
      const prepared = request.columns.map(column => {
        const registered = this.registry.get(column.config.canonId);
        if (!registered || registered.mode !== column.config.mode) return err(new DomainError('validation_failed', 'The requested canonicaliser is not registered for this tokenization mode.'));
        const builtin = ['stdtext1','stdnum1','stddate1','stdtime1'].includes(registered.canonId);
        return run.prepare(column.config, builtin ? undefined : registered);
      });
      for (const result of prepared) if (!result.ok) return result;
      return this.scope.run(request.sourceId, VaultRef(request.credentialRef), async session => {
        await session.query("SELECT set_config('TimeZone', 'UTC', true), set_config('DateStyle', 'ISO, YMD', true)");
        // Inspect base types as well as domains. A float's text rendering is not
        // an exact numeric input, even if that particular value looks integral.
        const types = z.array(z.object({ name: z.string(), type: z.string() })).parse(await session.query(`
          WITH RECURSIVE types AS (
            SELECT a.attname AS name, t.oid, t.typname, t.typbasetype
            FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
            WHERE a.attrelid=pg_catalog.to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped
            UNION ALL SELECT types.name,t.oid,t.typname,t.typbasetype
            FROM types JOIN pg_catalog.pg_type t ON t.oid=types.typbasetype
          ) SELECT name,typname AS type FROM types WHERE typbasetype=0`,
          [`${quote(request.schema)}.${quote(request.object)}`]));
        for (const column of request.columns) {
          const type = types.find(type => type.name === column.name)?.type;
          const expected = column.config.epochUnit ? 'number' : column.config.mode;
          if (type === undefined || modes[type] !== expected) return refused();
        }
        const selection = request.columns.map((column, index) => `${quote(column.name)}::text AS ${quote(`c${index}`)}`).join(',');
        await session.query(`DECLARE opintel_tokens NO SCROLL CURSOR FOR SELECT ${selection} FROM ${quote(request.schema)}.${quote(request.object)}`);
        let count = 0;
        try {
          for (;;) {
            const rows = await session.query('FETCH FORWARD 256 FROM opintel_tokens');
            if (rows.length === 0) break;
            for (const raw of rows) {
              const row = z.record(z.string(), z.union([z.string(), z.null()])).parse(raw);
              const treated: Record<string, string | null> = {};
              try {
                for (const [index, column] of request.columns.entries()) {
                  const transform = prepared[index]!;
                  if (!transform.ok) return transform;
                  const result = transform.value(row[`c${index}`]);
                  if (!result.ok) return result;
                  treated[column.name] = result.value;
                }
                await consume(Object.freeze(treated));
                count++;
              } finally {
                // Best effort only: JS strings and driver buffers cannot be zeroed.
                for (const name of Object.keys(row)) row[name] = null;
                if (typeof raw === 'object' && raw !== null) for (const name of Object.keys(raw)) Reflect.set(raw, name, null);
              }
            }
          }
          return ok(count);
        } finally { await session.query('CLOSE opintel_tokens'); }
      }, signal);
    });
  }
}
