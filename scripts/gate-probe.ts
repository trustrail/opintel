// Gate bootstrap only: authenticate to the configured test database and Redis.
// No application rows or migration ledger are changed.
import {setTimeout} from 'node:timers/promises';
import {Client} from 'pg';
import {createClient} from 'redis';
import {loadDevEnvironment} from './dev-environment.js';

async function main():Promise<void>{
 const environment=loadDevEnvironment(),service=process.argv[2];
 if(service!=='postgres'&&service!=='redis')throw new Error('Unknown gate dependency.');
 const until=Date.now()+3000;
 for(;;){
  try{
   if(service==='postgres'){
    const client=new Client({connectionString:environment.testDatabaseUrl,connectionTimeoutMillis:500,query_timeout:500});
    client.on('error',()=>{});
    try{await client.connect();await client.query('SELECT 1');}finally{await client.end();}
   }else{
    const client=createClient({url:environment.redisUrl,socket:{connectTimeout:500,reconnectStrategy:false}});
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
