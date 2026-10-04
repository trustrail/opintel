import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Exact, authored diagnostics only. An error code or Error subclass does not
// make its message safe: native diagnostics can contain rows and SQL.
const safeMessages = new Set([
  'HTTP response did not pass its boundary schema.',
  'AuthorizationPort was not configured.',
  'Download closed',
  'Download chunks must be strings.',
  'Usage: migrate.ts <up|down|status>',
  'MIGRATION_DATABASE_URL is required. Set it in the environment.',
  'MIGRATION_DATABASE_URL is required. Copy .env.example to .env, or set it inline.',
  'SPICEDB_ENDPOINT and SPICEDB_TOKEN are required.',
]);

const messageWithheld = '[exception message withheld]';
const locationWithheld = '[stack frame location withheld]';
const stackWithheld = '[stack content withheld]';

// Only shipped application filenames may survive a string stack. Function
// labels, dependency paths, eval text and arbitrary filenames are untrusted.
// Take the inventory once, before requests; never derive it from an exception.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const locations = new Map<string, string>();
for (const directory of ['src', 'sidecar', 'dist']) {
  const base = join(root, directory);
  try {
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:[cm]?js|tsx?)$/u.test(entry.name)) continue;
      const absolute = resolve(entry.parentPath, entry.name);
      const relative = absolute.slice(root.length).replaceAll('\\', '/');
      locations.set(absolute, relative);
      locations.set(pathToFileURL(absolute).href, relative);
      locations.set(relative, relative);
    }
  } catch {
    // A packaged build may omit sources. Unknown locations stay withheld.
  }
}

export interface LoggedException {
  readonly type: string;
  readonly message: string;
  readonly stack: readonly string[];
}

function safeType(error: Error): string {
  // Never emit name or constructor.name: either can contain customer values.
  if (error instanceof TypeError) return 'TypeError';
  if (error instanceof RangeError) return 'RangeError';
  if (error instanceof SyntaxError) return 'SyntaxError';
  if (error instanceof ReferenceError) return 'ReferenceError';
  if (error instanceof URIError) return 'URIError';
  if (error instanceof EvalError) return 'EvalError';
  if (Object.getPrototypeOf(error) === Error.prototype) return 'Error';
  return '[exception type withheld]';
}

export function sanitiseException(error: unknown): LoggedException {
  const fallback: LoggedException = { type: '[exception type withheld]', message: messageWithheld, stack: [stackWithheld] };
  try {
    if (!(error instanceof Error)) return fallback;
    const stack: string[] = [];
    const raw = error.stack;
    if (typeof raw === 'string') {
      // Do not emit the header or inspect cause, details, properties or values.
      for (const line of raw.split('\n').slice(1)) {
        const frame = /^\s+at (?:.* \()?([^()]+):(\d+):(\d+)\)?$/u.exec(line);
        if (!frame) { stack.push(stackWithheld); continue; }
        const location = locations.get(frame[1]!) ?? locationWithheld;
        stack.push(`at ${location}:${frame[2]}:${frame[3]}`);
      }
    } else if (raw !== undefined) stack.push(stackWithheld);
    return { type: safeType(error), message: safeMessages.has(error.message) ? error.message : messageWithheld, stack };
  } catch {
    // Custom accessors/prepareStackTrace must not make the logger fail or leak.
    return fallback;
  }
}

export function cliExceptionLine(operation: 'migration' | 'schema_load', error: unknown): string {
  return JSON.stringify({
    event: `${operation}.failed`,
    ...sanitiseException(error),
    diagnosis: operation === 'migration'
      ? 'Consult the database log for the native diagnostic; it may contain row data.'
      : 'Consult the SpiceDB server log for the native diagnostic; it may contain schema text.',
  }) + '\n';
}
