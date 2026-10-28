import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import process from 'node:process';

/** A wildcard bind alone misses loopback listeners on some macOS configurations. */
export async function acceptancePortPreflight(ports,{env=process.env,run=spawnSync}={}){
 for(const port of ports){
  const docker=run('docker',['ps','--filter','publish='+port,'--format','{{.Names}} ({{.Label "com.docker.compose.project"}})'],{encoding:'utf8',env,timeout:5000});
  if(docker.error||docker.status!==0)throw new Error('Port '+port+' preflight could not inspect Docker listeners.');
  if(docker.stdout.trim())throw new Error('Port '+port+' is held by Docker install '+docker.stdout.trim());
  const host=run('lsof',['-nP','-iTCP:'+port,'-sTCP:LISTEN'],{encoding:'utf8',env,timeout:5000});
  if(host.stdout?.trim())throw new Error('Port '+port+' has a host listener: '+host.stdout.trim());
  if(host.error&&host.error.code!=='ENOENT'||!host.error&&host.status!==0&&host.status!==1)throw new Error('Port '+port+' preflight could not inspect host listeners.');
  for(const address of ['127.0.0.1','::1','0.0.0.0'])await new Promise((resolve,reject)=>{
   const server=createServer();server.once('error',error=>{
    if(error.code==='EACCES'||address==='::1'&&['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(error.code)){resolve();return;}
    reject(new Error('Port '+port+' preflight failed on '+address+' ('+error.code+'); a host listener or bind failure prevents acceptance.'));
   });server.listen(port,address,()=>server.close(resolve));
  });
 }
}

/** Allocation floor only: available memory and host contention still affect timings.
 * Record the allocation in acceptance evidence before loading customer images. */
export function acceptanceMemoryPreflight({env=process.env,run=spawnSync}={}){
 const minimumGiB=Number(env.STAGE5_MIN_DOCKER_MEMORY_GIB??3);
 if(!Number.isFinite(minimumGiB)||minimumGiB<=0)throw new Error('STAGE5_MIN_DOCKER_MEMORY_GIB must be positive.');
 const response=run('docker',['info','--format','{{.MemTotal}}'],{encoding:'utf8',env,timeout:10000});
 if(response.error||response.status!==0)throw new Error('Docker memory preflight could not inspect its allocation; start or restart Docker Desktop.');
 const allocatedBytes=Number(response.stdout.trim());
 if(!Number.isSafeInteger(allocatedBytes)||allocatedBytes<=0)throw new Error('Docker memory preflight received an invalid allocation.');
 const minimumBytes=minimumGiB*1024**3;
 if(allocatedBytes<minimumBytes)throw new Error(`Docker memory allocation ${(allocatedBytes/1024**3).toFixed(2)} GiB is below ${minimumGiB} GiB; increase Docker Desktop memory before acceptance.`);
 return {allocatedBytes,minimumBytes};
}
