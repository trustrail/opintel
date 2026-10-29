import {assertTestSpiceDb} from './testing/datastore-safety.js';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadDevEnvironment,repositoryRoot} from './dev-environment.js';
import {testPreflight} from './service-readiness.js';
import {freshNormalRedis} from './testing/normal-redis.js';
import {freshNormalSpiceDb,seedNormalPostgres} from './testing/normal-environment.js';
import {bootstrapFailure} from './gate-preflight.mjs';
let bootstrapStage='load environment';

async function main():Promise<void>{
 const environment=loadDevEnvironment();
 // The performance launcher already owns its fresh datastore and explicit
 // warm-up. Never replace it or reset its fixtures in this shared child path.
 const performance=process.env.OPINTEL_PERFORMANCE_FRESH_DATASTORE==='1';
 let spice:Awaited<ReturnType<typeof freshNormalSpiceDb>>|undefined;
 let redis:Awaited<ReturnType<typeof freshNormalRedis>>|undefined;
 let baseline:Awaited<ReturnType<typeof seedNormalPostgres>>|undefined;
 try{
  bootstrapStage='isolated Redis image/startup';
  redis=await freshNormalRedis();process.env.REDIS_URL=redis.url;
  const isolatedEnvironment={...environment,redisUrl:redis.url};
  if(!performance){
   bootstrapStage='isolated SpiceDB image/startup/schema';
   spice=await freshNormalSpiceDb(environment);
   process.env.SPICEDB_ENDPOINT=spice.endpoint;process.env.SPICEDB_TOKEN=spice.token;
  }
  assertTestSpiceDb(spice?.endpoint??environment.spiceDbEndpoint);
  bootstrapStage='service readiness';
  await testPreflight(spice?{...isolatedEnvironment,spiceDbEndpoint:spice.endpoint,spiceDbToken:spice.token}:isolatedEnvironment);
  if(!performance){
   bootstrapStage='PostgreSQL fixture reset/seed';
   baseline=await seedNormalPostgres(environment);
   const metadata=join(repositoryRoot,'test-results','normal',randomUUID());await mkdir(metadata,{recursive:true});
   process.env.OPINTEL_NORMAL_RUN_METADATA=metadata;
   await writeFile(join(metadata,'run.json'),JSON.stringify({startedAt:new Date().toISOString(),args:process.argv.slice(2),spice:spice?.metadata,redis:redis.metadata,postgres:{baseline:'two industries, two filing vocabulary terms, one demo template; all other fixture tables empty; migration ledger preserved',counts:baseline.counts}},null,2)+'\n');
   console.info(JSON.stringify({normalSuiteBaseline:'verified',initialRelationships:0,postgresRows:baseline.counts,metadata}));
  }
  process.env.REQUIRE_DB_TESTS='1';
  process.exitCode=await new Promise<number>((resolve,reject)=>{
   const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url)),'run',...process.argv.slice(2)],{cwd:repositoryRoot,stdio:'inherit'});
   const interrupt=()=>{child.kill('SIGINT');},terminate=()=>{child.kill('SIGTERM');};
   process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
   child.once('error',reject);child.once('exit',code=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);resolve(code??1);});
  });
 }finally{try{await baseline?.close();}finally{try{await spice?.close();}finally{await redis?.close();}}}
}
void main().catch((error:unknown)=>{console.error(bootstrapFailure(error,bootstrapStage));process.exitCode=1;});
