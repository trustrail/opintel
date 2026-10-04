import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, expect, it } from 'vitest';

const execute = promisify(execFile);
beforeAll(async () => {
  if (process.platform !== 'linux' || process.env.S4_LINUX !== '1') {
    throw new Error('S4 requires its Linux container and /proc scanner. Run npm run test:ephemerality; this test is never skipped.');
  }
  await execute('node', ['--import', 'tsx', 'scripts/ephemerality/infrastructure/provision.ts'], { timeout: 180000 });
}, 180000);

it('S4 scanner controls: chunk boundaries, encodings, incomplete reads and missing sinks', async () => {
  await execute('python3', ['scripts/ephemerality/infrastructure/scanner.py']);
});
for (const name of ['clear', 'treated', 'aggregate', 'cancel', 'deadline', 'source_failure', 'staging_failure', 'memory_pressure', 'application']) {
  it(`J-019/TOK-38 S4: ${name}, live controls, write observation and honest residual report`, async () => {
    const result = await execute('python3', ['scripts/ephemerality/infrastructure/proof.py', name], { timeout: 590000, maxBuffer: 1024 * 1024 }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'stdout' in error && typeof error.stdout === 'string') console.info(error.stdout.trim());
      throw error;
    });
    const report: unknown = JSON.parse(result.stdout);
    expect(report).toMatchObject({ case: name, status: 'VERIFIED', failures: [], incomplete: [] });
    // Deliberately no assertion that residualMatches is zero. The full counts,
    // ranges and declared coverage remain in /reports/<case>.json.
    console.info(result.stdout.trim());
  });
}
