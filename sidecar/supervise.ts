import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loadSidecarConfig} from './config.js';
import {supervise,releaseChildLocks} from './supervision.js';

async function main():Promise<void>{
 const file=process.argv[2]??process.env.SIDECAR_CONFIG_FILE??resolve('tmp/sidecar/service.json');
 const {config}=await loadSidecarConfig(file);
 const stop=new AbortController();
 const halt=()=>stop.abort();process.once('SIGTERM',halt);process.once('SIGINT',halt);
 const log=(entry:Record<string,unknown>)=>console.info(JSON.stringify({timestamp:new Date().toISOString(),...entry}));
 const source=import.meta.url.endsWith('.ts');
 try{process.exitCode=await supervise({command:process.execPath,args:[...(source?['--import','tsx']:[]),fileURLToPath(new URL(source?'./start.ts':'./start.js',import.meta.url)),file],signal:stop.signal,shutdownMs:config.shutdownTimeoutMs+2000,log,
  afterExit:async pid=>{
   // Only reclaim locks owned by this exact, reaped child. Never remove an
   // unknown/pre-existing owner's lock or any landing state/evidence file.
   const count=await releaseChildLocks((config.landingZones??[]).map(zone=>zone.stateFile+'.lock'),pid);if(count)log({event:'engine.child_locks_released',pid,count});
  }});
 }finally{process.removeListener('SIGTERM',halt);process.removeListener('SIGINT',halt);}
}
void main().catch(()=>{console.error(JSON.stringify({timestamp:new Date().toISOString(),event:'engine.supervisor_failed',state:'stopped',action:'Inspect Engine configuration and filesystem permissions before restarting.'}));process.exitCode=1;});
