import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const directory = process.env.OPINTEL_DEADLINE_CONTROL_DIRECTORY;
if (!directory) throw new Error('Deadline control directory is required.');
process.env.OPINTEL_TEST_DATABASE_STOP = resolve(directory, 'stop');
export default defineConfig({ test: {
  include: ['test/fixtures/database-deadline/cases.fixture.ts'],
  runner: resolve('scripts/testing/database-runner.ts'),
  reporters: ['json', resolve('scripts/testing/database-stop-reporter.ts')],
  outputFile: resolve(directory, 'result.json'),
  fileParallelism: false, maxWorkers: 1, maxConcurrency: 1,
} });
