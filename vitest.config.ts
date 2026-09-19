import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/performance/**'],
    // Integration suites share one database. A reset must never run while
    // another test is using its rows; Promise.all inside tests still exercises
    // real concurrent transactions and outbox dispatchers.
    fileParallelism: false,
    maxConcurrency: 1,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
