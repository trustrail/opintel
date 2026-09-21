import { appendFile, cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  migrateDown,
  migrateUp,
  migrationStatus,
  type MigrationClient,
  type MigrationReporter,
} from '../src/platform/db/migrate.js';

type LedgerRecord = {
  version: string;
  name: string;
  checksum: string;
  applied_at: string;
};

class FakeMigrationClient implements MigrationClient {
  private ledger = new Map<string, LedgerRecord>();
  private transactionSnapshot: Map<string, LedgerRecord> | undefined;

  async query<Row extends Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }> {
    const normalized = statement.trim();
    if (normalized.startsWith('CREATE TABLE')) return { rows: [] };
    if (normalized === 'BEGIN') {
      this.transactionSnapshot = new Map(this.ledger);
      return { rows: [] };
    }
    if (normalized === 'COMMIT') {
      this.transactionSnapshot = undefined;
      return { rows: [] };
    }
    if (normalized === 'ROLLBACK') {
      if (this.transactionSnapshot !== undefined) this.ledger = this.transactionSnapshot;
      this.transactionSnapshot = undefined;
      return { rows: [] };
    }
    if (normalized.includes('SELECT fail')) throw new Error('migration statement failed');
    if (normalized.startsWith('INSERT INTO schema_migration')) {
      const [version, name, checksum] = values ?? [];
      if (typeof version !== 'string' || typeof name !== 'string' || typeof checksum !== 'string') {
        throw new Error('invalid ledger insert');
      }
      this.ledger.set(version, {
        version,
        name,
        checksum,
        applied_at: '2026-09-15T00:00:00.000Z',
      });
      return { rows: [] };
    }
    if (normalized.startsWith('DELETE FROM schema_migration')) {
      const [version] = values ?? [];
      if (typeof version !== 'string') throw new Error('invalid ledger delete');
      this.ledger.delete(version);
      return { rows: [] };
    }
    if (normalized.includes('FROM schema_migration')) {
      return { rows: [...this.ledger.values()] as unknown as Row[] };
    }
    return { rows: [] };
  }
}

const silentReporter: MigrationReporter = {
  applied: () => undefined,
  reverted: () => undefined,
  idle: () => undefined,
};

const fixtureRoot = path.resolve('test/fixtures/migrations');
const temporaryDirectories: string[] = [];

async function copiedFixture(name: 'success' | 'failing'): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'opintel-migration-'));
  temporaryDirectories.push(directory);
  await cp(path.join(fixtureRoot, name), directory, { recursive: true });
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('migration runner', () => {
  it('runs code backfills in the transaction, checksums them, and rolls down', async () => {
    const client = new FakeMigrationClient();
    const directory = await copiedFixture('success');
    const filename = path.join(directory, '002_backfill.up.ts');
    await writeFile(filename, "export default async function up(client) { await client.query('SELECT 1'); }\n");
    await writeFile(path.join(directory, '002_backfill.down.sql'), 'SELECT 1');
    expect(await migrateUp(client, directory, silentReporter)).toHaveLength(2);
    expect(await migrateUp(client, directory, silentReporter)).toHaveLength(0);
    await appendFile(filename, '// modified\n');
    await expect(migrateUp(client, directory, silentReporter)).rejects.toThrow('Checksum mismatch');
    await writeFile(filename, "export default async function up(client) { await client.query('SELECT 1'); }\n");
    await migrateDown(client, directory, silentReporter);
    expect(await migrationStatus(client)).toHaveLength(1);
  });

  it('applies a migration once and treats a second up as a no-op', async () => {
    const client = new FakeMigrationClient();
    const directory = await copiedFixture('success');

    expect(await migrateUp(client, directory, silentReporter)).toHaveLength(1);
    expect(await migrateUp(client, directory, silentReporter)).toHaveLength(0);
    expect(await migrationStatus(client)).toHaveLength(1);
  });

  it('leaves status empty after down', async () => {
    const client = new FakeMigrationClient();
    const directory = await copiedFixture('success');

    await migrateUp(client, directory, silentReporter);
    await migrateDown(client, directory, silentReporter);

    expect(await migrationStatus(client)).toEqual([]);
  });

  it('refuses an edited migration that was already applied', async () => {
    const client = new FakeMigrationClient();
    const directory = await copiedFixture('success');

    await migrateUp(client, directory, silentReporter);
    await appendFile(path.join(directory, '001_init.up.sql'), '\n-- edited after apply\n');

    await expect(migrateUp(client, directory, silentReporter))
      .rejects.toThrow('001_init.up.sql');
  });

  it('rolls back a failed migration without recording it in the ledger', async () => {
    const client = new FakeMigrationClient();
    const directory = await copiedFixture('failing');

    await expect(migrateUp(client, directory, silentReporter))
      .rejects.toThrow('migration statement failed');

    expect(await migrationStatus(client)).toEqual([]);
  });
});
