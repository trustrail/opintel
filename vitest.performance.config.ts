import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

class PerformanceSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = await super.sort(files);
    return ordered.sort((a, b) => Number(b.moduleId.endsWith('/mcp-query.test.ts')) - Number(a.moduleId.endsWith('/mcp-query.test.ts')));
  }
}

// Run first in check:data, in a separate process, never alongside another gate.
export default defineConfig({
  test: {
    runner: './scripts/testing/performance-runner.ts',
    reporters: ['default', './scripts/testing/database-stop-reporter.ts'],
    include: ['test/performance/**/*.test.ts'],
    pool: 'forks',
    isolate: false,
    retry: 0,
    sequence: { sequencer: PerformanceSequencer },
    fileParallelism: false,
    maxWorkers: 1,
    maxConcurrency: 1,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./scripts/testing/performance-setup.ts'],
  },
});
