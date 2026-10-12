import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client,type ClientConfig} from 'pg';
import {v1} from '@authzed/authzed-node';
import type {DevEnvironment} from '../dev-environment.js';
import {checkSpiceDb} from '../service-readiness.js';
import {observeReset} from './database-deadline.js';
import {datastoreSnapshot} from './spicedb-datastore.js';
const exec=promisify(execFile);
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';

export async function freshNormalSpiceDb(environment:DevEnvironment){
 const image=(await exec('docker',['image','inspect',process.env.OPINTEL_NORMAL_SPICEDB_IMAGE??'authzed/spicedb:latest','--format','{{.Id}}'])).stdout.trim();
 const name='opintel-normal-spicedb-'+randomUUID(),token=randomUUID();let created=false;
 const close=async()=>{if(created){await exec('docker',['rm','--force',name]);created=false;}};
 try{
  await exec('docker',['run','--detach','--name',name,'--publish','127.0.0.1::50051',image,'serve','--grpc-preshared-key',token,'--datastore-engine','memory']);created=true;
  const address=(await exec('docker',['port',name,'50051/tcp'])).stdout.trim();
  if(!/^127\.0\.0\.1:\d+$/u.test(address))throw new Error('Unexpected isolated SpiceDB bind address.');
  const endpoint=address.replace('127.0.0.1:','localhost:');const until=Date.now()+20_000;
  for(;;){try{await checkSpiceDb({...environment,spiceDbEndpoint:endpoint,spiceDbToken:token},false);break;}catch(error){if(Date.now()>=until)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
  const client=v1.NewClient(token,endpoint,v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
  let revision:string|null;
  try{
   await client.promises.writeSchema(v1.WriteSchemaRequest.create({schema:await readFile(new URL('../../docs/opintel-schema.zed',import.meta.url),'utf8')}));
   const snapshot=await datastoreSnapshot(client);if(snapshot.relationships.length!==0)throw new Error('Normal-suite SpiceDB baseline is not empty.');revision=snapshot.revision;
  }finally{client.close();}
  return {endpoint,token,metadata:{image,initialRelationships:0,revision},close};
 }catch(error){await close();throw error;}
}

// Bootstrap/test lifecycle, not application data access. The URL is checked by
// loadDevEnvironment before this can run. Hold a session lock until Vitest exits
// so another normal invocation cannot truncate this invocation's fixtures.
export async function seedNormalPostgres(environment:DevEnvironment){
 if(environment.testDatabaseUrl===environment.databaseUrl)throw new Error('Refusing to reset the development database.');
 const client=new Client({connectionString:environment.testDatabaseUrl,application_name:'opintel-normal-baseline',connectionTimeoutMillis:5000});
 try{
  await client.connect();const locked=await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock(hashtextextended('opintel-normal-suite',0)) AS locked");
  if(!locked.rows[0]?.locked)throw new Error('Another normal-suite invocation owns the test database.');
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='30s'");
  const tables=await client.query<{schema:string;name:string}>("SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p') AND NOT c.relispartition AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND NOT(n.nspname='public' AND c.relname='schema_migration') ORDER BY 1,2");
  const observation=await observeReset(client as Client & {processID:number;connectionParameters:ClientConfig});let failed=false;
  try{await client.query('TRUNCATE TABLE '+tables.rows.map(row=>`${quote(row.schema)}.${quote(row.name)}`).join(', ')+' RESTART IDENTITY');}
  catch(error){failed=true;throw error;}finally{await observation.finish(failed);}
  await client.query(`INSERT INTO industry(slug,name,description) VALUES
   ('reinsurance-treaty','Reinsurance Treaty','Reinsurance treaty vocabulary and demo pack.'),
   ('general','General','No industry vocabulary. Terms you define yourself.')`);
  for(const file of ['021_reinsurance_filing_vocabulary.up.sql','024_reinsurance_demo_pack.up.sql'])await client.query(await readFile(new URL('../../migrations/'+file,import.meta.url),'utf8'));
  const counts:Record<string,number>={};
  for(const row of tables.rows){const result=await client.query<{n:string}>(`SELECT count(*) AS n FROM ${quote(row.schema)}.${quote(row.name)}`);counts[`${row.schema}.${row.name}`]=Number(result.rows[0]!.n);}
  if(counts['public.industry']!==2||counts['public.vocabulary_term']!==2||counts['public.demo_source_template']!==1||Object.entries(counts).some(([table,count])=>!['public.industry','public.vocabulary_term','public.demo_source_template'].includes(table)&&count!==0))throw new Error('Normal-suite Postgres baseline differs from the declared seed.');
  await client.query('COMMIT');return {counts,close:()=>client.end()};
 }catch(error){try{await client.query('ROLLBACK');}finally{await client.end();}throw error;}
}
