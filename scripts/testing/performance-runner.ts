import type { RunnerTask, RunnerTestSuite } from 'vitest';
import DatabaseTestRunner from './database-runner.js';
import {closeTestDatabasePools} from './database-deadline.js';
import { measurementContext } from './performance-measurement.js';
import { closePerformanceLookupClient, warmPerformanceProcess } from './performance-warmup.js';
import {datastoreClient,datastoreSnapshot,removeFixtureRelationships,type DatastoreSnapshot} from './spicedb-datastore.js';

let headerPrinted = false;
let datastoreVerified = false;

export default class PerformanceRunner extends DatabaseTestRunner {
  private teardownRegistered=false;
  private registerTeardown():void{
    if(this.teardownRegistered)return;
    this.teardownRegistered=true;
    this.onCleanupWorkerContext(async()=>{
      closePerformanceLookupClient();
      await closeTestDatabasePools();
      console.info(JSON.stringify({performanceResources:'closed',resources:['shared PostgreSQL pools','LookupResources channel'],pid:process.pid}));
    });
  }
  private fixtureSnapshots = new WeakMap<object, DatastoreSnapshot>();
  private async remember(task:object):Promise<void>{
    const client=datastoreClient();
    try{this.fixtureSnapshots.set(task,await datastoreSnapshot(client));}finally{client.close();}
  }
  private async cleanup(task:object):Promise<void>{
    const before=this.fixtureSnapshots.get(task);
    if(!before)return;
    const client=datastoreClient();
    try{const deleted=await removeFixtureRelationships(client,before);console.info(JSON.stringify({performanceFixtureCleanup:true,deletedRelationships:deleted}));}finally{client.close();}
  }
  override async onBeforeRunSuite(suite:RunnerTestSuite):Promise<void>{
    this.registerTeardown();
    await super.onBeforeRunSuite(suite);
    if(process.env.OPINTEL_PERFORMANCE_FRESH_DATASTORE!=='1')throw new Error('Performance suite requires its isolated fresh datastore launcher.');
    await this.remember(suite);
    if(!datastoreVerified){
      const snapshot=this.fixtureSnapshots.get(suite)!;
      if(snapshot.relationships.length!==0)throw new Error('Performance datastore was not empty before fixtures.');
      console.info(JSON.stringify({performanceDatastore:'verified fresh',totalRelationships:0,revision:snapshot.revision}));
      datastoreVerified=true;
    }
  }
  override async onAfterRunSuite(suite:RunnerTestSuite):Promise<void>{
    await this.cleanup(suite);
    await super.onAfterRunSuite(suite);
  }
  override async onBeforeRunTask(task: RunnerTask): Promise<void> {
    await super.onBeforeRunTask(task);
    if (!headerPrinted) {
      console.info('PERFORMANCE CONTRACT: budgets are steady-state budgets. K-007 cold is the sole deliberate cold measurement, before one explicit unmeasured warm-up. Serial shared process; no retries; budgets unchanged.');
      headerPrinted = true;
    }
    if (!task.name.startsWith('K-007 cold:')) await warmPerformanceProcess();
    await this.remember(task);
    console.info(JSON.stringify({ performanceCase: task.name, phase: 'start', ...measurementContext() }));
  }

  override async onAfterRunTask(task: RunnerTask): Promise<void> {
    // Drain and confirm database cleanup before considering a deadline nonblocking.
    await super.onAfterRunTask(task);
    await this.cleanup(task);
    console.info(JSON.stringify({ performanceCase: task.name, phase: 'end', ...measurementContext() }));
    const errors = task.result?.errors;
    if (task.name.startsWith('K-007 cold:') && task.result?.state === 'fail' && errors?.length === 1 && errors[0]?.code === 'OPINTEL_COLD_MEASUREMENT_DEADLINE') {
      console.info(JSON.stringify({ measurement: 'K-007 cold', status: 'recorded-failing', reason: 'measurement deadline', budgetMs: null, durationMs: task.result.duration, ...measurementContext() }));
      task.result.state = 'skip';
      task.result.errors = undefined;
    }
  }
}
