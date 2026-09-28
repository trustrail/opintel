import { defineConfig } from 'vitest/config';

// Standalone engine fixtures: no Postgres, Redis or SpiceDB prerequisite.
export default defineConfig({
  test: {
    name: 'bypass',
    include: ['test/bypass/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    maxConcurrency: 1,
    retry: 0,
    allowOnly: false,
  },
});
