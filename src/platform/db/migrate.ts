import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

type QueryResult<Row> = { rows: Row[] };

export interface MigrationClient {
  query<Row extends Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export type AppliedMigration = {
  version: string;
  name: string;
  checksum: string;
  appliedAt: string;
};

type Migration = {
  version: string;
  name: string;
  upPath: string;
  downPath: string;
  checksum: string;
};

export type MigrationReporter = {
  applied(migration: Migration, durationMs: number): void;
  reverted(migration: Migration, durationMs: number): void;
  idle(direction: 'up' | 'down'): void;
};

const defaultReporter: MigrationReporter = {
  applied: (migration, durationMs) => process.stdout.write(`Applied ${migration.version}_${migration.name} up in ${durationMs}ms.\n`),
  reverted: (migration, durationMs) => process.stdout.write(`Reverted ${migration.version}_${migration.name} down in ${durationMs}ms.\n`),
  idle: (direction) => process.stdout.write(`No migrations to run ${direction}.\n`),
};

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../migrations',
);

const migrationFilename = /^(?<version>\d+)_(?<name>[a-z0-9_]+)\.(?<direction>up|down)\.sql$/u;

async function migrationsIn(directory: string): Promise<Migration[]> {
  const files = await readdir(directory);
  const parts = new Map<string, { name: string; upPath?: string; downPath?: string }>();

  for (const file of files) {
    const match = migrationFilename.exec(file);
    if (match?.groups === undefined) continue;

    const { version, name, direction } = match.groups;
    if (version === undefined || name === undefined || direction === undefined) continue;

    const entry = parts.get(version) ?? { name };
    if (entry.name !== name) {
      throw new Error(`Migration version ${version} has more than one name.`);
    }
    if (direction === 'up') entry.upPath = path.join(directory, file);
    if (direction === 'down') entry.downPath = path.join(directory, file);
    parts.set(version, entry);
  }

  const migrations: Migration[] = [];
  for (const [version, entry] of [...parts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (entry.upPath === undefined || entry.downPath === undefined) {
      throw new Error(`Migration ${version}_${entry.name} must have both up and down files.`);
    }
    const source = await readFile(entry.upPath);
    migrations.push({
      version,
      name: entry.name,
      upPath: entry.upPath,
      downPath: entry.downPath,
      checksum: createHash('sha256').update(source).digest('hex'),
    });
  }
  return migrations;
}

async function ensureLedger(client: MigrationClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function migrationStatus(client: MigrationClient): Promise<AppliedMigration[]> {
  await ensureLedger(client);
  const result = await client.query<{
    version: string;
    name: string;
    checksum: string;
    applied_at: string;
  }>(`
    SELECT version, name, checksum, applied_at
    FROM schema_migration
    ORDER BY version
  `);
  return result.rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
}

async function verifyAppliedChecksums(
  client: MigrationClient,
  migrations: Migration[],
): Promise<AppliedMigration[]> {
  const applied = await migrationStatus(client);
  const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]));

  for (const record of applied) {
    const migration = migrationsByVersion.get(record.version);
    if (migration === undefined) {
      throw new Error(`Applied migration ${record.version}_${record.name} is missing from migrations.`);
    }
    if (migration.name !== record.name || migration.checksum !== record.checksum) {
      throw new Error(`Checksum mismatch for applied migration ${path.basename(migration.upPath)}.`);
    }
  }
  return applied;
}

async function inTransaction<T>(client: MigrationClient, work: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function migrateUp(
  client: MigrationClient,
  directory = migrationsDirectory,
  reporter: MigrationReporter = defaultReporter,
): Promise<Migration[]> {
  const migrations = await migrationsIn(directory);
  const applied = await verifyAppliedChecksums(client, migrations);
  const appliedVersions = new Set(applied.map((migration) => migration.version));
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));

  for (const migration of pending) {
    const startedAt = performance.now();
    const statement = await readFile(migration.upPath, 'utf8');
    await inTransaction(client, async () => {
      await client.query(statement);
      await client.query(
        'INSERT INTO schema_migration (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum],
      );
    });
    reporter.applied(migration, Math.round(performance.now() - startedAt));
  }

  if (pending.length === 0) reporter.idle('up');
  return pending;
}

export async function migrateDown(
  client: MigrationClient,
  directory = migrationsDirectory,
  reporter: MigrationReporter = defaultReporter,
): Promise<Migration | null> {
  const migrations = await migrationsIn(directory);
  const applied = await verifyAppliedChecksums(client, migrations);
  const latest = applied.at(-1);
  if (latest === undefined) {
    reporter.idle('down');
    return null;
  }

  const migration = migrations.find((candidate) => candidate.version === latest.version);
  if (migration === undefined) {
    throw new Error(`Applied migration ${latest.version}_${latest.name} is missing from migrations.`);
  }

  const startedAt = performance.now();
  const statement = await readFile(migration.downPath, 'utf8');
  await inTransaction(client, async () => {
    await client.query(statement);
    await client.query('DELETE FROM schema_migration WHERE version = $1', [migration.version]);
  });
  reporter.reverted(migration, Math.round(performance.now() - startedAt));
  return migration;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'up' && command !== 'down' && command !== 'status') {
    throw new Error('Usage: migrate.ts <up|down|status>');
  }
  if (process.env.DATABASE_URL === undefined) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (command === 'up') await migrateUp(client);
    if (command === 'down') await migrateDown(client);
    if (command === 'status') {
      const applied = await migrationStatus(client);
      for (const migration of applied) {
        process.stdout.write(`${migration.version}_${migration.name} applied at ${migration.appliedAt}.\n`);
      }
      if (applied.length === 0) process.stdout.write('No applied migrations.\n');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Migration runner failed.';
    process.stderr.write(`Migration failed: ${message}\n`);
    process.exitCode = 1;
  });
}
