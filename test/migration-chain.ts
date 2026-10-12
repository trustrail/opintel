import {migrateDown,migrateUp,migrationStatus,pendingMigrations,type MigrationClient,type MigrationReporter} from '../src/platform/db/migrate.js';
const silent:MigrationReporter={applied:()=>{},reverted:()=>{},idle:()=>{}};
/** Caller owns BEGIN/ROLLBACK. Use the real ledger/order/checksums, with each
 * runner transaction nested as a savepoint so no test DDL escapes rollback. */
export async function migrationChainInTransaction(client:MigrationClient){
 if((await pendingMigrations(client)).length)throw new Error('Migration round-trip requires the full applied baseline.');
 const before=await migrationStatus(client);
 const nested:MigrationClient={query:<Row extends Record<string,unknown>>(sql:string,values?:readonly unknown[])=>client.query<Row>(sql==='BEGIN'?'SAVEPOINT migration_chain_step':sql==='COMMIT'?'RELEASE SAVEPOINT migration_chain_step':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT migration_chain_step':sql,values)};
 return {
  async unwindAfter(version:string){
   if(!before.some(m=>m.version===version))throw new Error('The round-trip target is not applied.');
   const reverted:string[]=[];
   for(;;){const last=(await migrationStatus(client)).at(-1);if(!last||last.version<=version)break;
    const migration=await migrateDown(nested,undefined,silent);if(!migration)throw new Error('Migration chain ended before its target.');reverted.push(migration.version);
   }
   return reverted;
  },
  async restore(){await migrateUp(nested,undefined,silent);return migrationStatus(client);},
  before,
 };
}
