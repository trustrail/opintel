import {spawnSync} from 'node:child_process';
import {openSync,closeSync,fchmodSync} from 'node:fs';

// A long soak can produce more than spawnSync's buffered-output limit. Keep
// complete diagnostics on disk, never in a parent-process string buffer.
export function captureProcessLog(command,args,file,{env,timeout=600000}={}){
 const fd=openSync(file,'w',0o600);
 try{
  fchmodSync(fd,0o600);
  const result=spawnSync(command,args,{env,timeout,stdio:['ignore',fd,fd]});
  if(result.error||result.status!==0)throw new Error('Log capture failed ('+(result.error?.code??result.status??result.signal)+'); private log: '+file);
 }finally{closeSync(fd);}
}
