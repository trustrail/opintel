import {testContainerImage} from '../gate-preflight.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {checkRedis} from '../service-readiness.js';
import {gateContainerLabels} from '../gate-containers.mjs';
const exec=promisify(execFile);
/** FLUSHDB tests must never share the console's session store, even on another
 * numbered database: test fixtures also select database 1. Own the whole server. */
export async function freshNormalRedis(){
 const image=await testContainerImage('redis');
 const name='opintel-normal-redis-'+randomUUID();let created=false;
 const close=async()=>{if(created){await exec('docker',['rm','--force',name]);created=false;}};
 try{
  await exec('docker',['run','--detach','--name',name,...gateContainerLabels(),'--publish','127.0.0.1::6379',image,'redis-server','--save','','--appendonly','no']);created=true;
  const address=(await exec('docker',['port',name,'6379/tcp'])).stdout.trim();
  if(!/^127\.0\.0\.1:\d+$/u.test(address))throw new Error('Unexpected isolated Redis bind address.');
  const url='redis://'+address;const until=Date.now()+10000;
  for(;;){try{await checkRedis(url);break;}catch(error){if(Date.now()>=until)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
  return {url,metadata:{image,isolated:true},close};
 }catch(error){await close();throw error;}
}
