import {assertTestSpiceDb} from './testing/datastore-safety.js';
import {sanitiseException} from '../src/platform/telemetry/exception-log.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {v1} from '@authzed/authzed-node';
import {Client} from 'pg';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadDevEnvironment,repositoryRoot} from './dev-environment.js';
import {checkSpiceDb,testPreflight} from './service-readiness.js';
const exec=promisify(execFile);

async function main():Promise<void>{
  const environment=loadDevEnvironment();
  // Resolve the locally installed image to its immutable ID. Never implicitly
  // pull a floating tag while taking a performance measurement.
  const image=(await exec('docker',['image','inspect',process.env.OPINTEL_PERFORMANCE_SPICEDB_IMAGE??'authzed/spicedb:latest','--format','{{.Id}}'])).stdout.trim();
  const name='opintel-performance-spicedb-'+randomUUID(),token=randomUUID();
  let created=false;
  try{
    await exec('docker',['run','--detach','--name',name,'--publish','127.0.0.1::50051',image,'serve','--grpc-preshared-key',token,'--datastore-engine','memory']);created=true;
    const address=(await exec('docker',['port',name,'50051/tcp'])).stdout.trim();
    if(!/^127\.0\.0\.1:\d+$/u.test(address))throw new Error('Unexpected isolated SpiceDB bind address.');
    const endpoint=address.replace('127.0.0.1:','localhost:');
    assertTestSpiceDb(endpoint);
    const readyUntil=Date.now()+20_000;
    for(;;){
      try{await checkSpiceDb({...environment,spiceDbEndpoint:endpoint,spiceDbToken:token},false);break;}
      catch(error){if(Date.now()>=readyUntil)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
    }
    const client=v1.NewClient(token,endpoint,v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
    try{await client.promises.writeSchema(v1.WriteSchemaRequest.create({schema:await readFile(new URL('../docs/opintel-schema.zed',import.meta.url),'utf8')}));}finally{client.close();}
    console.info(JSON.stringify({performanceDatastore:'fresh memory',image,expectedInitialRelationships:0,verification:'checked from the datastore before fixtures by the performance runner'}));
    await testPreflight({...environment,spiceDbEndpoint:endpoint,spiceDbToken:token});
    const observer=new Client({connectionString:environment.testDatabaseUrl,application_name:'opintel-performance-exit-observer'});
    await observer.connect();
    const sessions=async()=> (await observer.query<{pid:number;backend_start:string;application_name:string;state:string}>("SELECT pid,backend_start::text,application_name,state FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() ORDER BY pid")).rows;
    const baseline=await sessions();
    console.info(JSON.stringify({performanceDatabaseConnections:'before',sessions:baseline}));
    let code:number;
    try{
    code=await new Promise<number>((resolve,reject)=>{
      const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./test.ts',import.meta.url)),...process.argv.slice(2)],{
        cwd:repositoryRoot,stdio:'inherit',env:{...process.env,SPICEDB_ENDPOINT:endpoint,SPICEDB_TOKEN:token,OPINTEL_PERFORMANCE_FRESH_DATASTORE:'1'},
      });
      const interrupt=()=>{child.kill('SIGINT');},terminate=()=>{child.kill('SIGTERM');};
      process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
      child.once('error',reject);child.once('exit',exit=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);resolve(exit??1);});
    });
    const existing=new Set(baseline.map(row=>`${row.pid}:${row.backend_start}`));
    const until=Date.now()+2000;
    let remaining=(await sessions()).filter(row=>!existing.has(`${row.pid}:${row.backend_start}`));
    // Worker exit closes sockets; PostgreSQL may not yet have processed EOF.
    // This is a bounded cleanup confirmation, not a measurement retry.
    while(remaining.length&&Date.now()<until){
      await new Promise(resolve=>setTimeout(resolve,25));
      remaining=(await sessions()).filter(row=>!existing.has(`${row.pid}:${row.backend_start}`));
    }
    console.info(JSON.stringify({performanceDatabaseConnections:'after worker exit',newSessionsRemaining:remaining}));
    if(remaining.length)throw new Error('Database sessions outlived the performance worker; see session diagnostics.');
    }finally{await observer.end();}
    process.exitCode=code;
  }catch(error){
    if(created){const logs=await exec('docker',['logs',name]);await writeFile(join(tmpdir(),'opintel-performance-spicedb-startup.log'),(logs.stdout+logs.stderr).replaceAll(token,'[withheld]'),{mode:0o600});}
    throw error;
  }finally{if(created)await exec('docker',['rm','--force',name]);}
}
void main().catch((error:unknown)=>{console.error(JSON.stringify({event:'performance.datastore_failed',...sanitiseException(error)}));process.exitCode=1;});
