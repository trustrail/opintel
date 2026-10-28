// Gate bootstrap only: authenticate to the test server maintenance database and Redis.
// No application rows or migration ledger are changed.
import {setTimeout} from 'node:timers/promises';
import {loadDevEnvironment} from './dev-environment.js';

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
    try{await client.connect();await client.query('SELECT 1');}finally{await client.end();}
   }else{
    if(!redis)throw new Error('Redis probe driver unavailable.');
    const client=redis.createClient({url:environment.redisUrl,socket:{connectTimeout:500,reconnectStrategy:false}});
    client.on('error',()=>{});
    try{await client.connect();await client.ping();}finally{if(client.isOpen)client.destroy();}
   }
   return;
  }catch{
   if(Date.now()>=until)throw new Error('Gate dependency is unreachable.');
   await setTimeout(100);
  }
 }
}
void main().then(()=>process.exit(0),()=>process.exit(1));
