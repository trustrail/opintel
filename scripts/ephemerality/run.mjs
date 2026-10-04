import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../../', import.meta.url));
mkdirSync(new URL('../../test-results/ephemerality/', import.meta.url), { recursive: true });
const args = ['compose', '-p', 'opintel-s4', '-f', 'scripts/ephemerality/compose.yml'];
// Isolated disposable services. Never connects to the developer's databases.
try {
  const result = spawnSync('docker', [...args, 'up', '--build', '--abort-on-container-exit', '--exit-code-from', 'proof'], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  const cleanup = spawnSync('docker', [...args, 'down', '--volumes'], { cwd: root, stdio: 'inherit' });
  if (cleanup.status !== 0) process.exitCode = 1;
}
