import { TestRunner, type RunnerTask, type RunnerTestSuite, type RunnerTestCase } from 'vitest';
import { getFn, setFn, getHooks } from '@vitest/runner';
import { DatabaseOwner, databasePhase, databaseRunStopped, installDatabaseDeadlines } from './database-deadline.js';

export default class DatabaseTestRunner extends TestRunner {
  private owners = new WeakMap<object, DatabaseOwner>();

  private owner(task: object): DatabaseOwner {
    let owner = this.owners.get(task);
    if (!owner) {
      owner = new DatabaseOwner();
      owner.deadline = () => {
        // Vitest 4.1 exposes the active timeout window to its runner. Reading
        // it covers hook overrides as well as test.timeout; never reset it.
        const timing = this as unknown as { _currentTaskStartTime?: number; _currentTaskTimeout?: number };
        if (timing._currentTaskStartTime === undefined || timing._currentTaskTimeout === undefined) throw new Error('Active Vitest deadline is unavailable. Refusing unbounded database work.');
        return timing._currentTaskTimeout <= 0 ? Number.POSITIVE_INFINITY : timing._currentTaskStartTime + timing._currentTaskTimeout;
      };
      this.owners.set(task, owner);
    }
    return owner;
  }

  onCollected(files: RunnerTestSuite[]): void {
    installDatabaseDeadlines();
    const visit = (suite: RunnerTestSuite): void => {
      const hooks = getHooks(suite);
      // A collection failure has no registered hooks. Preserve Vitest's
      // original import error rather than adding a secondary runner error.
      if (!hooks) return;
      const wrapHooks = <K extends 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach'>(name: K): void => {
        hooks[name] = hooks[name].map(hook => {
          const wrapped = async (...args: Parameters<typeof hook>) => {
            const context = name === 'beforeEach' || name === 'afterEach' ? args[0] as RunnerTestCase['context'] : undefined;
            // Teardown has a fresh owner: the timed-out body's async work
            // keeps its aborted owner and cannot borrow teardown's deadline.
            const owner = name === 'afterEach' || name === 'afterAll' ? new DatabaseOwner() : this.owner(context?.task ?? suite);
            if (name === 'afterEach' || name === 'afterAll') owner.deadline = this.owner(suite).deadline;
            return databasePhase(owner, name === 'afterEach' || name === 'afterAll' ? undefined : context?.signal, () => Reflect.apply(hook, undefined, args) as ReturnType<typeof hook>);
          };
          // Preserve Vitest's hook metadata, including cleanup deadlines.
          Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(hook));
          return wrapped as typeof hook;
        }) as typeof hooks[K];
      };
      for (const name of ['beforeAll', 'afterAll', 'beforeEach', 'afterEach'] as const) wrapHooks(name);
      for (const task of suite.tasks) {
        if (task.type === 'suite') visit(task);
        else {
          const fn = getFn(task);
          setFn(task, () => databasePhase(this.owner(task), task.context.signal, fn));
        }
      }
    };
    files.forEach(visit);
  }

  override async onBeforeRunTask(task: RunnerTask): Promise<void> {
    if (databaseRunStopped()) this.cancel('test-failure');
    await super.onBeforeRunTask(task);
  }

  override async onBeforeRunSuite(suite: RunnerTestSuite): Promise<void> {
    if (databaseRunStopped()) this.cancel('test-failure');
    await super.onBeforeRunSuite(suite);
  }

  override async onAfterRunTask(task: RunnerTask): Promise<void> {
    const owner = this.owners.get(task);
    if (owner) {
      owner.abort(); // Async work from a completed test cannot use a later deadline.
      if (owner.hasPendingWork()) await owner.drain();
    }
    super.onAfterRunTask(task);
  }
}
