import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import { expect, it } from 'vitest';

it.for(['deadline', 'lock', 'unconfirmed'])('runner control: %s', async (scenario, context) => {
  const directory = await mkdtemp(join(tmpdir(), 'opintel-deadline-control-'));
  try {
    const child = spawn(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', 'test/fixtures/database-deadline/vitest.config.ts'], {
      env: { ...process.env, OPINTEL_DEADLINE_CONTROL_DIRECTORY: directory, OPINTEL_DEADLINE_CONTROL_CASE: scenario },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const cancelChild = () => {
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        try { process.kill(-child.pid, 'SIGTERM'); }
        catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
      }
    };
    const exited = new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('exit', done); });
    context.onTestFinished(async () => { cancelChild(); await exited; });
    context.signal.addEventListener('abort', cancelChild, { once: true });
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    const exit = await exited;
    context.signal.removeEventListener('abort', cancelChild);
    expect(exit, output).toBe(1); // The root failure stays an honest failure.
    const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')) as {
      numFailedTests: number; numPassedTests: number;
      testResults: { assertionResults: { title: string; status: string; failureMessages: string[] }[] }[];
    };
    const assertions = result.testResults.flatMap(file => file.assertionResults);
    expect(result.numFailedTests, JSON.stringify(assertions)).toBe(1);
    if (scenario === 'deadline') {
      expect(result.numPassedTests).toBe(1);
      expect(existsSync(join(directory, 'next-ran'))).toBe(true);
      expect(await readFile(join(directory, 'root-aborted'), 'utf8')).toBe('true');
    } else {
      expect(result.numPassedTests).toBe(0);
      expect(existsSync(join(directory, 'stop'))).toBe(true);
      expect(existsSync(join(directory, 'next-ran'))).toBe(false);
      expect(assertions[1]!.status).toBe('pending');
      expect(assertions[0]!.failureMessages.join(' ')).toContain('Database test run stopped');
    }
  } finally {
    const tableFile = join(directory, 'table');
    if (existsSync(tableFile)) {
      const table = await readFile(tableFile, 'utf8');
      if (!/^deadline_[a-f0-9]{32}$/u.test(table)) throw new Error('Unexpected deadline control table.');
      const cleanup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await cleanup.connect();
      try { await cleanup.query(`DROP TABLE IF EXISTS "${table}"`); } finally { await cleanup.end(); }
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000); // New subprocess control includes Vitest startup; existing budgets unchanged.
