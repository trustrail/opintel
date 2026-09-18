import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadDevEnvironment, repositoryRoot } from './dev-environment.js';
import { testPreflight } from './service-readiness.js';

async function main(): Promise<void> {
  await testPreflight(loadDevEnvironment());
  process.env.REQUIRE_DB_TESTS = '1';
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    'run', 'test', ...process.argv.slice(2),
  ], { cwd: repositoryRoot, stdio: 'inherit' });
  child.on('error', () => { console.error('Could not start Vitest. Run npm ci and retry.'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Test preflight failed. Run npm run dev:up.');
  process.exitCode = 1;
});
