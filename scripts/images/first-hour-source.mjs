import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync,copyFileSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import assert from 'node:assert/strict';
import process from 'node:process';

/** External plain Postgres, never a packaged readiness/demo database. */
export async function firstHourSource({directory,image,host,recordFailure,env=process.env,run=spawnSync}){
 assert.match(image,/^postgres:[^@]+@sha256:[a-f0-9]{64}$/u,'First-hour source must be pinned official Postgres');
 assert.equal(typeof recordFailure,'function','Fixture failures must be recorded before cleanup');
 const suffix=randomUUID(),name='opintel-first-hour-source-'+suffix,network=name+'-network';
 const password=randomBytes(32).toString('hex'),passwordFile=join(directory,'first-hour-source.password');
 const environmentFile=join(directory,'first-hour-source.env'),sql=join(directory,'first-hour-customer.sql');
 writeFileSync(passwordFile,password,{mode:0o600});chmodSync(passwordFile,0o600);
 writeFileSync(environmentFile,'POSTGRES_USER=customer\nPOSTGRES_DB=customer\nPOSTGRES_PASSWORD='+password+'\n',{mode:0o600});chmodSync(environmentFile,0o600);
 copyFileSync('test/fixtures/first-hour/customer.sql',sql);chmodSync(sql,0o644);
 function docker(args){const r=run('docker',args,{encoding:'utf8',env,timeout:120000});if(r.error||r.status!==0)throw new Error('First-hour source fixture '+args[0]+' failed');return r.stdout.trim();}
 let created=false,networkCreated=false;
 const log=join(directory,'first-hour-source.log');
 const close=()=>{if(created){const output=run('docker',['logs',name],{encoding:'utf8',env,timeout:10000,maxBuffer:8*1024*1024});writeFileSync(log,(output.stdout??'')+(output.stderr??''),{mode:0o600});chmodSync(log,0o600);docker(['rm','--force',name]);created=false;}if(networkCreated){docker(['network','rm',network]);networkCreated=false;}};
 try{
  docker(['network','create',network]);networkCreated=true;
  docker(['run','--detach','--name',name,'--network',network,'--env-file',environmentFile,'--publish','0.0.0.0::5432','--mount',`type=bind,src=${resolve(sql)},dst=/docker-entrypoint-initdb.d/customer.sql,readonly`,image]);created=true;
  const until=Date.now()+120000;
  for(;;){const r=run('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','customer','-d','customer'],{encoding:'utf8',env,timeout:5000});if(r.status===0)break;if(Date.now()>=until)throw new Error('First-hour source fixture TCP readiness timed out');await setTimeout(500);}
  const binding=docker(['port',name,'5432/tcp']),port=/0\.0\.0\.0:(\d+)/u.exec(binding)?.[1];assert.ok(port,'Fixture published port missing');
  return {name,network,image,host,port,database:'customer',user:'customer',passwordFile,log,close};
 }catch(error){await recordFailure(error,{container:name,network,image,log});close();throw error;}
}
