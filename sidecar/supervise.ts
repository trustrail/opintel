import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {unavailableEngine} from './http/unavailable.js';
import {readinessMessages} from '../src/shared/engine-readiness.js';
import {loadSidecarConfig} from './config.js';
import {supervise,releaseChildLocks} from './supervision.js';

async function main():Promise<void>{
 const file=process.argv[2]??process.env.SIDECAR_CONFIG_FILE??resolve('tmp/sidecar/service.json');
 const {config,tls}=await loadSidecarConfig(file);
 const stop=new AbortController();
 const halt=()=>stop.abort();process.once('SIGTERM',halt);process.once('SIGINT',halt);
 const log=(entry:Record<string,unknown>)=>console.info(JSON.stringify({timestamp:new Date().toISOString(),...entry}));
 const source=import.meta.url.endsWith('.ts');
 let diagnostic:Awaited<ReturnType<typeof unavailableEngine>>|undefined;
 try{process.exitCode=await supervise({command:process.execPath,args:[...(source?['--import','tsx']:[]),fileURLToPath(new URL(source?'./start.ts':'./start.js',import.meta.url)),file],signal:stop.signal,shutdownMs:config.shutdownTimeoutMs+2000,log,
  beforeStart:async()=>{await diagnostic?.close();diagnostic=undefined;},
  afterExit:async(pid,reason)=>{
   // Only reclaim locks owned by this exact, reaped child. Never remove an
   // unknown/pre-existing owner's lock or any landing state/evidence file.
   const count=await releaseChildLocks((config.landingZones??[]).map(zone=>zone.stateFile+'.lock'),pid);if(count)log({event:'engine.child_locks_released',pid,count});
   if(!stop.signal.aborted){const code=reason??'engine_process_stopped';diagnostic=await unavailableEngine(config,tls,code);log({event:'engine.unavailable',readinessReason:code,message:readinessMessages[code]});}
  }});
  // Terminal means no more children, while the authenticated status endpoint
  // remains available for operators until the supervisor is explicitly stopped.
  if(process.exitCode===1&&!stop.signal.aborted)await new Promise<void>(resolve=>{stop.signal.addEventListener('abort',()=>resolve(),{once:true});});
 }finally{await diagnostic?.close();process.removeListener('SIGTERM',halt);process.removeListener('SIGINT',halt);}
}
void main().catch(()=>{console.error(JSON.stringify({timestamp:new Date().toISOString(),event:'engine.supervisor_failed',state:'stopped',action:'Inspect Engine configuration and filesystem permissions before restarting.'}));process.exitCode=1;});
