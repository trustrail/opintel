import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { v1 } from '@authzed/authzed-node';
import { config as loadEnvironmentFile } from 'dotenv';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
if (process.env.NODE_ENV !== 'production') loadEnvironmentFile({ path: path.join(repositoryRoot, '.env') });

async function main(): Promise<void> {
  const endpoint = process.env.SPICEDB_ENDPOINT;
  const token = process.env.SPICEDB_TOKEN;
  if (endpoint === undefined || token === undefined) {
    throw new Error('SPICEDB_ENDPOINT and SPICEDB_TOKEN are required.');
  }
  const security = endpoint.startsWith('localhost:') || endpoint.startsWith('127.0.0.1:')
    ? v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED
    : v1.ClientSecurity.SECURE;
  const client = v1.NewClient(token, endpoint, security);
  try {
    const schema = await readFile(path.join(repositoryRoot, 'docs/opintel-schema.zed'), 'utf8');
    await client.promises.writeSchema(v1.WriteSchemaRequest.create({ schema }));
    process.stdout.write('Loaded opintel-schema.zed into SpiceDB.\n');
  } finally {
    client.close();
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'SpiceDB schema load failed.';
    process.stderr.write(`SpiceDB schema load failed: ${message}\n`);
    process.exitCode = 1;
  });
}
