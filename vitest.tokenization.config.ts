import { defineConfig } from 'vitest/config';
// Computational collision proof runs on its own, never beside latency budgets.
export default defineConfig({ test: {
  include: ['test/tokenization-stress/**/*.test.ts'],
  fileParallelism: false, maxWorkers: 1, maxConcurrency: 1,
} });
