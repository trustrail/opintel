import {Client} from 'pg';
import {migrateUp,pendingMigrations} from '../db/migrate.js';

/** Development bootstrap only: never invoked by test/gate or production startup. */
export async function checkDevelopmentMigrations(environment:Readonly<Record<string,string|undefined>>=process.env):Promise<void>{
 if(environment.NODE_ENV==='test'||environment.NODE_ENV==='production')return;
 const application=environment.DATABASE_URL;
 if(!application)throw new Error('DATABASE_URL is required.');
 const migration=environment.MIGRATION_DATABASE_URL||application;
 const identity=(value:string)=>{const url=new URL(value);return `${url.hostname}:${url.port||'5432'}${url.pathname}`;};
 if(identity(application)!==identity(migration))throw new Error('Development migration connection must name the application database.');
 if(environment.TEST_DATABASE_URL&&identity(application)===identity(environment.TEST_DATABASE_URL))throw new Error('Development startup cannot migrate the test database.');
 const client=new Client({connectionString:migration,connectionTimeoutMillis:5000});
 try{
  await client.connect();
  const pending=await pendingMigrations(client);
  if(pending.length===0)return;
  if(environment.DEV_AUTO_MIGRATE!=='1'&&environment.DEV_AUTO_MIGRATE!=='true'){
   // Only repository filenames are reported; native database errors still use S4a.
   console.error(JSON.stringify({event:'api.development_migrations_pending',pending,message:'Development API cannot start. Run npm run migrate:up, or set DEV_AUTO_MIGRATE=1 to apply these migrations at startup.'}));
   throw new Error('Development database has pending migrations.');
  }
  console.info(JSON.stringify({event:'api.development_migrations_applying',pending}));
  await migrateUp(client);
  if((await pendingMigrations(client)).length!==0)throw new Error('Development database still has pending migrations.');
 }finally{await client.end();}
}
