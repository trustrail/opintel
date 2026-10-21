import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectId, UserId } from '../src/shared/kernel/index.js';

type SettingRow = { current_setting: string | null };

const database = vi.hoisted(() => {
  const statements: string[] = [];
  class ReusableClient {
    private readonly sessionSettings = new Map<string, string>([['jit', 'on'], ['work_mem', '4MB']]);
    private localSettings = new Map<string, string>();

    async query(
      statement: string,
      params?: readonly unknown[],
    ): Promise<{ rows: Record<string, string | null>[] }> {
      statements.push(statement);
      if (statement === 'BEGIN') {
        this.localSettings = new Map();
        return { rows: [] };
      }
      if (statement === 'COMMIT' || statement === 'ROLLBACK') {
        this.localSettings = new Map();
        return { rows: [] };
      }
      if (statement.includes("set_config('app.user_id'")) {
        const userId = params?.[0];
        const projectId = params?.[1];
        if (typeof userId !== 'string' || typeof projectId !== 'string') {
          throw new Error('scope must bind tenant settings');
        }
        this.localSettings.set('app.user_id', userId);
        this.localSettings.set('app.project_id', projectId);
        return { rows: [] };
      }
      if (statement === "SELECT current_setting('jit') AS jit, current_setting('work_mem') AS work_mem") {
        return {rows: [{jit: this.localSettings.get('jit') ?? this.sessionSettings.get('jit') ?? null, work_mem: this.localSettings.get('work_mem') ?? this.sessionSettings.get('work_mem') ?? null}]};
      }
      if (statement.startsWith('SET LOCAL jit = ')) {
        this.localSettings.set('jit', statement.slice('SET LOCAL jit = '.length));
        return {rows: []};
      }
      if (statement.startsWith("SET LOCAL work_mem = '")) {
        this.localSettings.set('work_mem', statement.slice("SET LOCAL work_mem = '".length, -1));
        return {rows: []};
      }
      if (statement === "SELECT set_config('jit', $1, true), set_config('work_mem', $2, true)") {
        this.localSettings.set('jit', String(params?.[0]));
        this.localSettings.set('work_mem', String(params?.[1]));
        return {rows: []};
      }
      if (statement === 'SELECT broken_statement') throw new Error('statement failed');
      if (statement === "SET app.project_id = 'x'") {
        this.sessionSettings.set('app.project_id', 'x');
        return { rows: [] };
      }
      if (statement === "SELECT current_setting('app.project_id', true)") {
        return {
          rows: [{
            current_setting: this.localSettings.get('app.project_id')
              ?? this.sessionSettings.get('app.project_id')
              ?? null,
          }],
        };
      }
      return { rows: [] };
    }

    release(): void {}
  }

  const client = new ReusableClient();

  return {
    statements,
    Pool: class {
      async connect(): Promise<ReusableClient> {
        return client;
      }
    },
  };
});

vi.mock('pg', () => ({ Pool: database.Pool }));

const { withTenant } = await import('../src/platform/db/scope.js');

const userId = UserId('018f8f9d-7f83-7abc-8def-0123456789ab');
const firstProjectId = ProjectId('018f8f9d-7f83-7abc-8def-0123456789ac');
const secondProjectId = ProjectId('018f8f9d-7f83-7abc-8def-0123456789ad');

afterEach(() => {
  vi.clearAllMocks();
  database.statements.length = 0;
});

describe('tenant scope session settings', () => {
  const tuning = "SELECT current_setting('jit') AS jit, current_setting('work_mem') AS work_mem";
  const context = {userId, projectId: firstProjectId};

  it('applies only allowlisted settings to one statement and restores the following query', async () => {
    await withTenant(context, async tx => {
      expect(await tx.query(tuning, [], {jit: 'off', work_mem: 7000})).toEqual([{jit: 'off', work_mem: '7000kB'}]);
      expect(await tx.query(tuning)).toEqual([{jit: 'on', work_mem: '4MB'}]);
    });
    expect(await withTenant(context, tx => tx.query(tuning))).toEqual([{jit: 'on', work_mem: '4MB'}]);
  });

  it('does not leak settings to a concurrently queued statement', async () => {
    const results = await withTenant(context, tx => Promise.all([
      tx.query(tuning, [], {jit: 'off'}), tx.query(tuning),
    ]));
    expect(results).toEqual([[{jit: 'off', work_mem: '4MB'}], [{jit: 'on', work_mem: '4MB'}]]);
  });

  it('restores settings on rollback after a failed tuned statement', async () => {
    await expect(withTenant(context, tx => tx.query('SELECT broken_statement', [], {jit: 'off', work_mem: 7000}))).rejects.toThrow('statement failed');
    expect(await withTenant(context, tx => tx.query(tuning))).toEqual([{jit: 'on', work_mem: '4MB'}]);
  });

  it.each(['SELECT broken_statement', 'SET LOCAL statement_timeout = 0'])('drains queued statements before rollback when Promise.all fails: %s', async failing => {
    await expect(withTenant(context, tx => Promise.all([
      tx.query(failing, [], {jit: 'off'}), tx.query(tuning, [], {work_mem: 7000}),
    ]))).rejects.toThrow();
    expect(database.statements.at(-1)).toBe('ROLLBACK');
    expect(database.statements.lastIndexOf(tuning)).toBeLessThan(database.statements.lastIndexOf('ROLLBACK'));
    expect(await withTenant(context, tx => tx.query(tuning))).toEqual([{jit: 'on', work_mem: '4MB'}]);
  });

  it('rejects arbitrary settings through both SQL and the typed options at runtime', async () => {
    await expect(withTenant(context, tx => tx.query('SET LOCAL statement_timeout = 0'))).rejects.toThrow('session settings');
    const settings = {jit: 'off' as const, statement_timeout: 0};
    await expect(withTenant(context, tx => tx.query(tuning, [], settings))).rejects.toThrow('Statement settings permit only');
  });

  it('rejects an invalid JIT value at runtime before it can become SQL', async () => {
    const settings = {jit: 'off' as const};
    Reflect.set(settings, 'jit', 'off; RESET ROLE');
    await expect(withTenant(context, tx => tx.query(tuning, [], settings))).rejects.toThrow('Statement settings permit only');
  });

  it.each(['RESET work_mem', 'BEGIN', 'COMMIT', 'ROLLBACK', "SELECT set_config('row_security', 'off', true)", 'SET LOCAL ROLE opintel_platform_admin', 'SET LOCAL jit = off'])('preserves the raw session/transaction SQL rejection: %s', async sql => {
    await expect(withTenant(context, tx => tx.query(sql))).rejects.toThrow('session settings');
  });

  it.each([63, 65_537, 64.5, NaN, Infinity])('rejects work_mem outside its integer KiB range: %s', async work_mem => {
    await expect(withTenant(context, tx => tx.query(tuning, [], {work_mem}))).rejects.toThrow('Statement settings permit only');
  });

  it.each([64, 65_536])('accepts the work_mem boundary: %s KiB', async work_mem => {
    const rows = await withTenant(context, tx => tx.query(tuning, [], {work_mem}));
    expect(rows).toEqual([{jit: 'on', work_mem: `${work_mem}kB`}]);
  });

  it('rejects a callback attempt to set app.project_id at session scope', async () => {
    await expect(withTenant(
      { userId, projectId: firstProjectId },
      async (tx) => tx.query("SET app.project_id = 'x'"),
    )).rejects.toThrow('session settings');
  });

  it('binds the next scope to its own project on the reused connection', async () => {
    await withTenant(
      { userId, projectId: firstProjectId },
      async () => undefined,
    );

    const projectSetting = await withTenant(
      { userId, projectId: secondProjectId },
      async (tx) => {
        const rows = await tx.query<SettingRow>(
          "SELECT current_setting('app.project_id', true)",
        );
        return rows[0]?.current_setting;
      },
    );

    expect(projectSetting).toBe(secondProjectId);
  });
});
