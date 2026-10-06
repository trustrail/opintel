import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import { loadDevEnvironment } from '../scripts/dev-environment.js';
import { testPreflight } from '../scripts/service-readiness.js';

export default async function globalSetup(): Promise<()=>Promise<void>> {
  const environment = loadDevEnvironment();
  await testPreflight(environment);
  // Workers receive these variables before setup.ts binds the test database.
  process.env.REQUIRE_DB_TESTS = '1';
  const prefix='migration_'+randomUUID().replaceAll('-','').slice(0,16)+'_';
  process.env.OPINTEL_MIGRATION_TEST_PREFIX=prefix;
  // Database removal belongs to the run lifecycle, not a test-file hook.
  // Await it after all workers close their connections; propagate any failure.
  return async()=>{
    const owner=new Client({connectionString:environment.testDatabaseUrl});await owner.connect();
    try{
      const databases=await owner.query<{datname:string}>('SELECT datname FROM pg_database WHERE starts_with(datname,$1)',[prefix]);
      for(const {datname} of databases.rows){
        if(!new RegExp('^'+prefix+'[a-f0-9]{32}$','u').test(datname))throw new Error('Unexpected migration fixture database name');
        await owner.query(`DROP DATABASE "${datname}"`);
      }
    }finally{await owner.end();}
  };
}
