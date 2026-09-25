import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const version = lock.packages['node_modules/@playwright/test'].version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a released Playwright version in package-lock.json.');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const supplied = process.argv.slice(2);
const selection = supplied.some(arg => /^--(?:project|config)(?:=|$)/.test(arg))
  ? [] : ['--project=visual-snapshots'];
console.log(`[Playwright Docker] ${image}`);
const result = spawnSync('docker', [
  'run', '--rm', '--init', '--ipc=host', '--platform=linux/amd64',
  '--mount', `type=bind,source=${root},target=/work`,
  // Linux dependencies must never overwrite the host's node_modules.
  '--volume', '/work/node_modules', '--workdir', '/work', '--env', 'CI=1',
  image, 'sh', '-c', 'npm ci && exec npx playwright test "$@"', 'playwright',
  '--workers=1', ...selection, ...supplied,
], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
