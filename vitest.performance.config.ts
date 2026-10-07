import { defineConfig } from 'vitest/config';

// Run in a separate process after the functional suite, never alongside it.
export default defineConfig({
  test: {
    runner: './scripts/testing/database-runner.ts',
    reporters: ['default', './scripts/testing/database-stop-reporter.ts'],
    include: ['test/performance/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    maxConcurrency: 1,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
