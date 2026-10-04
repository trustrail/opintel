import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('prints local filing commands from the Opintel Engine register CLI help', () => {
  const command = fileURLToPath(new URL('../sidecar/ingest/command.ts', import.meta.url));
  const help = execFileSync(process.execPath, ['--import', 'tsx', command, '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  expect(help).toContain('Stop Opintel Engine before using a local register command.');
  expect(help).toContain('npm run sidecar:register -- show SOURCE_ID FILING_ID [CONFIG]');
  expect(help).toContain('npm run sidecar:register -- retry SOURCE_ID FILING_ID [CONFIG]');
}, 30_000);
