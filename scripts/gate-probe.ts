// Gate bootstrap only: authenticate to the test server maintenance database and Redis.
// No application rows or migration ledger are changed.
import {setTimeout} from 'node:timers/promises';
import {loadDevEnvironment} from './dev-environment.js';
import {GatePrerequisiteError,postgresFailure} from './gate-preflight.mjs';

async function main():Promise<void>{
 const environment=loadDevEnvironment(),service=process.argv[2];
 if(service!=='postgres'&&service!=='redis')throw new Error('Unknown gate dependency.');
 // Each bounded worker needs only its own driver; avoid loading Redis in the
 // PostgreSQL probe and vice versa under host startup contention.
 const pg=service==='postgres'?await import('pg'):undefined;
 const redis=service==='redis'?await import('redis'):undefined;
 const until=Date.now()+3000;
 for(;;){
  try{
   if(service==='postgres'){
    const maintenance=new URL(environment.testDatabaseUrl);maintenance.pathname='/postgres';
    if(!pg)throw new Error('PostgreSQL probe driver unavailable.');
    const client=new pg.Client({connectionString:maintenance.toString(),connectionTimeoutMillis:500,query_timeout:500});
    client.on('error',()=>{});
    try{
     await client.connect();
     const result=await client.query<{allowed:boolean}>('SELECT rolcanlogin AND (rolcreatedb OR rolsuper) AS allowed FROM pg_roles WHERE rolname=current_user');
     if(!result.rows[0]?.allowed)throw new GatePrerequisiteError('Test PostgreSQL user needs CREATEDB');
    }finally{await client.end();}
   }else{
    if(!redis)throw new Error('Redis probe driver unavailable.');
    const client=redis.createClient({url:environment.redisUrl,socket:{connectTimeout:500,reconnectStrategy:false}});
    client.on('error',()=>{});
    try{await client.connect();await client.ping();}finally{if(client.isOpen)client.destroy();}
   }
   return;
  }catch(error:unknown){
   if(error instanceof GatePrerequisiteError)throw error;
   if(Date.now()>=until){
    if(service==='postgres')throw new GatePrerequisiteError(postgresFailure(error));
    throw new GatePrerequisiteError('Redis is not running');
   }
   await setTimeout(100);
  }
 }
}
void main().then(()=>process.exit(0),(error:unknown)=>{if(error instanceof GatePrerequisiteError)console.info(error.message);process.exit(1);});
