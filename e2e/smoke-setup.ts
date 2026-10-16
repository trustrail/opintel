import {loadDevEnvironment} from '../scripts/dev-environment.js';
import {freshNormalSpiceDb,seedNormalPostgres} from '../scripts/testing/normal-environment.js';
import {testPreflight} from '../scripts/service-readiness.js';
export default async function setup(){
 const environment=loadDevEnvironment();
 const spice=await freshNormalSpiceDb(environment);
 let seed:Awaited<ReturnType<typeof seedNormalPostgres>>|undefined;
 try{
  process.env.SPICEDB_ENDPOINT=spice.endpoint;process.env.SPICEDB_TOKEN=spice.token;
  await testPreflight({...environment,spiceDbEndpoint:spice.endpoint,spiceDbToken:spice.token});
  seed=await seedNormalPostgres(environment);
  process.env.DATABASE_URL=environment.testDatabaseUrl;
  return async()=>{try{await seed?.close();}finally{await spice.close();}};
 }catch(error){await seed?.close();await spice.close();throw error;}
}
