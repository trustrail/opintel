import process from 'node:process';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,URL} from 'node:url';
import {config} from 'dotenv';
import pg from 'pg';
import {GatePrerequisiteError,postgresFailure} from './gate-preflight.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const exec=promisify(execFile);
async function migrate(url){
 await exec(process.execPath,['--import','tsx','src/platform/db/migrate.ts','up'],{
  cwd:root,env:{...process.env,NODE_ENV:'production',MIGRATION_DATABASE_URL:url},
  timeout:120000,killSignal:'SIGKILL',maxBuffer:1024*1024,
 });
}

// Names are generated internally, never supplied by an operator. A run suffix
// avoids one gate dropping another gate's database, even in the same checkout.
export function gateDatabase({environment=process.env,checkout=root,clientFactory=options=>new pg.Client(options),migrateDatabase=migrate}={}){
 if(environment===process.env)config({path:new URL('../.env',import.meta.url),quiet:true});
 const configured=environment.TEST_DATABASE_URL??environment.DATABASE_URL;
 if(!configured)throw new Error('Gate database requires DATABASE_URL or TEST_DATABASE_URL.');
 const admin=new URL(configured);
 if(!['postgres:','postgresql:'].includes(admin.protocol))throw new Error('Gate database requires a PostgreSQL URL.');
 for(const key of admin.searchParams.keys())if(['host','hostaddr','port','database','dbname','service','connectionString'].includes(key))throw new Error('Gate database URL must not contain routing overrides.');
 const name=`opintel_test_gate_${createHash('sha256').update(checkout).digest('hex').slice(0,12)}_${randomBytes(6).toString('hex')}`;
 const target=new URL(admin);target.pathname='/'+name;
 admin.pathname='/postgres';
 let owned=false;
 async function query(sql,onSuccess=()=>{}){
  const client=clientFactory({connectionString:admin.toString(),connectionTimeoutMillis:3000,query_timeout:10000,statement_timeout:9000});
  client.on('error',()=>{});
  try{await client.connect();await client.query(sql);onSuccess();}finally{await client.end();}
 }
 return {
  name,url:target.toString(),
  async prepare(){
   try{await query(`CREATE DATABASE "${name}" TEMPLATE template0`,()=>{owned=true;});}
   catch(error){throw new GatePrerequisiteError(postgresFailure(error));}
   try{await migrateDatabase(target.toString());}
   catch{throw new Error('Test PostgreSQL: isolated gate database migration failed or exceeded 120 seconds.');}
  },
  async close(){
   if(!owned)return;
   try{await query(`DROP DATABASE "${name}" WITH (FORCE)`);owned=false;}
   catch{throw new Error(`Test PostgreSQL: cleanup failed for owned gate database ${name}.`);}
  },
 };
}
