import { defineConfig } from 'vitest/config';

// Authenticated attacks also use the real metadata, relationship and MCP path.
export default defineConfig({
  test: {
    runner: './scripts/testing/database-runner.ts',
    reporters: ['default', './scripts/testing/database-stop-reporter.ts'],
    name: 'bypass',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    include: ['test/bypass/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    maxConcurrency: 1,
    retry: 0,
    allowOnly: false,
  },
});
