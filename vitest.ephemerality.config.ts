import { defineConfig } from 'vitest/config';

// Linux /proc and syscall observation are mandatory, never skipped on a host.
export default defineConfig({ test: {
  name: 'ephemerality', include: ['test/ephemerality/**/*.test.ts'],
  fileParallelism: false, maxWorkers: 1, maxConcurrency: 1,
  retry: 0, allowOnly: false, testTimeout: 600_000,
} });
