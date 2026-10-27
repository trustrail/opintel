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
