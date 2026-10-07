import type { Reporter, Vitest } from 'vitest/node';
import { databaseRunStopped } from './database-deadline.js';

export default class DatabaseStopReporter implements Reporter {
  private context?: Vitest;
  onInit(context: Vitest): void { this.context = context; }
  onTestCaseResult(): void {
    // Do not await cancellation inside the worker's result RPC: cancellation
    // itself waits for workers, which would deadlock this callback.
    if (databaseRunStopped()) void this.context?.cancelCurrentRun('test-failure');
  }
}
