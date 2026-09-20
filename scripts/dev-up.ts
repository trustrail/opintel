import { startDevelopmentSidecar } from './sidecar-dev.js';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { Client } from 'pg';
import { v1 } from '@authzed/authzed-node';
import { migrateUp } from '../src/platform/db/migrate.js';
import { loadDevEnvironment, repositoryRoot } from './dev-environment.js';
import { checkRedis, checkSpiceDb, spiceDbClient, testPreflight } from './service-readiness.js';

async function composeUp(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '60'], { cwd: repositoryRoot, stdio: 'inherit' });
    child.on('error', () => reject(new Error('Docker Compose could not start. Start Docker and retry npm run dev:up.')));
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Compose services did not become healthy. Check docker compose logs.')));
  });
}

async function waitUntilReady(check: () => Promise<void>): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (true) {
    try { await check(); return; } catch (error) {
      if (Date.now() >= deadline) throw error;
      await setTimeout(1_000);
    }
  }
}

async function prepareDatabase(connectionString: string, migrate = true): Promise<void> {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!name) throw new Error('Database URL must include a database name.');
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = new Client({ connectionString: maintenance.toString(), connectionTimeoutMillis: 5_000 });
  try {
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      // CREATE DATABASE cannot use parameters or run inside an application scope/transaction.
      await admin.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
      console.info(`Created database "${name}".`);
    }
  } finally { await admin.end(); }
  if (!migrate) return;
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  try {
    await client.connect();
    console.info(`Migrating database "${name}".`);
    await migrateUp(client);
  } finally { await client.end(); }
}

async function main(): Promise<void> {
  const environment = loadDevEnvironment();
  await composeUp();
  // Compose waits for Postgres/Redis healthchecks. SpiceDB's minimal image has
  // no healthcheck executable, so wait on its schema RPC (NOT_FOUND is ready).
  await waitUntilReady(() => checkSpiceDb(environment, false));
  await waitUntilReady(() => checkRedis(environment.redisUrl));
  await prepareDatabase(environment.migrationDatabaseUrl);
  const testMigration = new URL(environment.migrationDatabaseUrl);
  const test = new URL(environment.testDatabaseUrl);
  testMigration.hostname = test.hostname;
  testMigration.port = test.port;
  testMigration.pathname = test.pathname;
  await prepareDatabase(testMigration.toString());
  const demo = new URL(environment.migrationDatabaseUrl);
  demo.pathname = '/opintel_demo';
  await prepareDatabase(demo.toString(), false);
  // Child sidecar resolves this configured development-only reference. No store().
  process.env.OPINTEL_SECRET_DEMO_POSTGRES = demo.toString();
  const client = spiceDbClient(environment);
  try {
    const schema = await readFile(new URL('../docs/opintel-schema.zed', import.meta.url), 'utf8');
    await new Promise<void>((resolve, reject) => {
      client.writeSchema(v1.WriteSchemaRequest.create({ schema }), { deadline: Date.now() + 10_000 }, (error) => {
        if (error) reject(error); else resolve();
      });
    });
    console.info('Loaded docs/opintel-schema.zed into SpiceDB.');
  } finally { client.close(); }
  await testPreflight(environment);
  await startDevelopmentSidecar();
  console.info('Development services are ready. Run npm run dev:api, npm run dev, or npm test.');
}

void main().catch((error: unknown) => {
  console.error(`dev:up failed: ${error instanceof Error ? error.message : 'Bootstrap failed.'}`);
  process.exitCode = 1;
});
