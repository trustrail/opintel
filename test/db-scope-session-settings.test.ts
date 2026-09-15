import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectId, UserId } from '../src/shared/kernel/index.js';

type SettingRow = { current_setting: string | null };

const database = vi.hoisted(() => {
  class ReusableClient {
    private readonly sessionSettings = new Map<string, string>();
    private localSettings = new Map<string, string>();

    async query(
      statement: string,
      params?: readonly unknown[],
    ): Promise<{ rows: SettingRow[] }> {
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
});

describe('tenant scope session settings', () => {
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
