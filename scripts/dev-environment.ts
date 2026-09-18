import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export type DevEnvironment = {
  databaseUrl: string;
  migrationDatabaseUrl: string;
  testDatabaseUrl: string;
  redisUrl: string;
  spiceDbEndpoint: string;
  spiceDbToken: string;
};

export function loadDevEnvironment(): DevEnvironment {
  config({ path: new URL('../.env', import.meta.url) });
  function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is missing. Copy .env.example to .env or set it in the environment.`);
    return value;
  }
  const databaseUrl = required('DATABASE_URL');
  const development = new URL(databaseUrl);
  const derivedTest = new URL(databaseUrl);
  if (development.pathname.length <= 1) throw new Error('DATABASE_URL must include a database name.');
  derivedTest.pathname += '_test';
  const testDatabaseUrl = process.env.TEST_DATABASE_URL || derivedTest.toString();
  const test = new URL(testDatabaseUrl);
  if (development.hostname === test.hostname && (development.port || '5432') === (test.port || '5432') && development.pathname === test.pathname) {
    throw new Error('TEST_DATABASE_URL must name a different database from DATABASE_URL.');
  }
  process.env.TEST_DATABASE_URL = testDatabaseUrl;
  return {
    databaseUrl, testDatabaseUrl,
    migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL || databaseUrl,
    redisUrl: required('REDIS_URL'),
    spiceDbEndpoint: required('SPICEDB_ENDPOINT'), spiceDbToken: required('SPICEDB_TOKEN'),
  };
}
