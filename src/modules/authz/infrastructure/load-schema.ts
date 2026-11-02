import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';
import { v1 } from '@authzed/authzed-node';
import { config as loadEnvironmentFile } from 'dotenv';
import { cliExceptionLine } from '../../../platform/telemetry/exception-log.js';

// Replaced with the reviewed schema by the minified migration-image build.
// Native development keeps reading the authored schema from the repository.
declare const OPINTEL_AUTHORIZATION_SCHEMA:string|undefined;

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
if (process.env.NODE_ENV !== 'production') loadEnvironmentFile({ path: path.join(repositoryRoot, '.env') });

// gRPC status codes, never native error text (which can include schema or secrets).
const grpcCodes = ['OK','CANCELED','UNKNOWN','INVALID_ARGUMENT','DEADLINE_EXCEEDED',
  'NOT_FOUND','ALREADY_EXISTS','PERMISSION_DENIED','RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION','ABORTED','OUT_OF_RANGE','UNIMPLEMENTED','INTERNAL',
  'UNAVAILABLE','DATA_LOSS','UNAUTHENTICATED'] as const;
type SchemaWriteCode = typeof grpcCodes[number];
function schemaWriteCode(error: unknown): SchemaWriteCode {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'number' ? grpcCodes[code] ?? 'UNKNOWN' : 'UNKNOWN';
}
export class SpiceDbSchemaWriteError extends Error {
  constructor(readonly code: SchemaWriteCode, readonly attempts: number) {
    super(`SpiceDB schema write failed after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}; last code: ${code}.`);
  }
}

// Each write must honour its supplied RPC allowance. The final RPC and backoff
// are capped to the remaining monotonic budget; the schema itself is unchanged.
export async function writeSchemaWithRetry(
  write: (allowanceMs: number) => Promise<void>,
  timing: {now?: () => number; sleep?: (milliseconds: number) => Promise<void>} = {},
): Promise<void> {
  const now = timing.now ?? (() => performance.now()), sleep = timing.sleep ?? (async ms => {await wait(ms);});
  const until = now() + 120_000;
  let attempts = 0, code: SchemaWriteCode = 'UNKNOWN';
  while (now() < until) {
    const allowance = Math.min(5_000, until - now());
    if (allowance <= 0) break;
    attempts++;
    if (attempts > 1) process.stderr.write(JSON.stringify({event:'schema_load.retry',attempt:attempts,code}) + '\n');
    try {
      await write(allowance);
      return;
    } catch (error: unknown) {
      code = schemaWriteCode(error);
      if (!['UNAVAILABLE','DEADLINE_EXCEEDED','CANCELED'].includes(code)) throw new SpiceDbSchemaWriteError(code, attempts);
      const remaining = until - now();
      if (remaining <= 0) break;
      await sleep(Math.min(250, remaining));
    }
  }
  throw new SpiceDbSchemaWriteError(code, attempts);
}

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
    const schema = typeof OPINTEL_AUTHORIZATION_SCHEMA==='undefined'
      ? await readFile(path.join(repositoryRoot, 'docs/opintel-schema.zed'), 'utf8')
      : OPINTEL_AUTHORIZATION_SCHEMA;
    await writeSchemaWithRetry(allowance => new Promise<void>((resolve,reject)=>client.writeSchema(v1.WriteSchemaRequest.create({schema}),{deadline:Date.now()+allowance},error=>{if(error)reject(error);else resolve();})));
    process.stdout.write('Loaded opintel-schema.zed into SpiceDB.\n');
  } finally {
    client.close();
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(error instanceof SpiceDbSchemaWriteError
      ? JSON.stringify({event:'schema_load.failed',type:'Error',message:error.message,code:error.code,attempts:error.attempts}) + '\n'
      : cliExceptionLine('schema_load', error));
    process.exitCode = 1;
  });
}
