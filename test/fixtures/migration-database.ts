import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,afterAll} from 'vitest';
import {migrateDown,migrateUp,migrationStatus,type MigrationClient} from '../../src/platform/db/migrate.js';

/** Leave the named baseline applied using the real runner and checksum ledger. */
export async function migrateDownToVersion(client:MigrationClient,version:string){
 const applied=await migrationStatus(client);
 if(!applied.some(migration=>migration.version===version))throw new Error(`Migration baseline ${version} is not applied.`);
 while((await migrationStatus(client)).at(-1)?.version!==version){
  if(!await migrateDown(client))throw new Error(`Migration chain ended before baseline ${version}.`);
 }
}

/** Empty, fully migrated owner fixture. Downgrades encounter real dependencies
 * without deleting another test's provenance to get past their guards. */
export function migrationDatabase(){
 const prefix=process.env.OPINTEL_MIGRATION_TEST_PREFIX;if(!prefix)throw new Error('Migration fixtures require the test run lifecycle');
 const name=prefix+randomUUID().replaceAll('-','');
 let owner:Client,db:Client|undefined;
 beforeAll(async()=>{
  const started=performance.now();
  try{
  owner=new Client({connectionString:process.env.TEST_DATABASE_URL});await owner.connect();
  await owner.query(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.TEST_DATABASE_URL!);url.pathname='/'+name;
  db=new Client({connectionString:url.toString()});await db.connect();
  await migrateUp(db,undefined,{applied:()=>{},reverted:()=>{},idle:()=>{}});
  }finally{console.info(`Migration fixture setup: ${(performance.now()-started).toFixed(0)} ms (${name})`);}
 },60_000);
 afterAll(async()=>{try{await db?.end();}finally{await owner?.end();}});
 return ()=>{if(!db)throw new Error('Migration fixture was not initialized');return db;};
}
