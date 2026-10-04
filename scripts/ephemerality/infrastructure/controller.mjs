import process from 'node:process';
import { cp, mkdir, chown, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
for (const directory of ['/audit', '/custody', '/ingest', '/audit/sinks', '/ingest/control']) {
  await mkdir(directory, { recursive: true });
  await chown(directory, 65534, 65534);
  await chmod(directory, 0o700);
}
for (const directory of ['scripts', 'test', 'docs']) {
  await cp(directory === 'docs' ? '/work/docs' : `/work/compiled/${directory}`, `/harness/${directory}`, { recursive: true });
}
const child = spawn('npx', ['vitest', 'run', '--config', 'vitest.ephemerality.config.ts'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
