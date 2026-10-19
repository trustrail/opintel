import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {supervise,restartDelaysMs,releaseChildLocks} from '../sidecar/supervision.js';

it('X-02: retries a crashing child with bounded backoff and a terminal exhaustion record',async()=>{
 const logs:Record<string,unknown>[]=[];
 expect(restartDelaysMs).toEqual([1000,2000,4000,8000,16000]);
 const status=await supervise({command:process.execPath,args:['-e','process.kill(process.pid,"SIGKILL")'],signal:new AbortController().signal,shutdownMs:100,delays:[5,10],log:e=>logs.push(e)});
 expect(status).toBe(1);expect(logs.filter(e=>e.event==='engine.process_exited')).toHaveLength(3);
 expect(logs.filter(e=>e.event==='engine.restart_scheduled').map(e=>e.delayMs)).toEqual([5,10]);
 expect(logs.at(-1)).toMatchObject({event:'engine.restart_exhausted',restarts:2,state:'stopped'});
});
it('X-02: a replacement serves after a crash; intentional shutdown stops it without restarting',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'engine-supervisor-')),marker=join(dir,'attempt');const stop=new AbortController();const logs:Record<string,unknown>[]=[];
 let launches=0;
 const timer=setInterval(()=>{void readFile(marker,'utf8').then(value=>{if(value==='serving')stop.abort();},()=>{});},10);
 try{
  const status=await supervise({command:process.execPath,args:['-e',`const fs=require('node:fs');if(!fs.existsSync(process.argv[1])){fs.writeFileSync(process.argv[1],'first');process.exit(1);}fs.writeFileSync(process.argv[1],'serving');setInterval(()=>{},1000);`,marker],signal:stop.signal,shutdownMs:100,delays:[5],log:e=>logs.push(e),afterExit:async()=>{launches++;}});
  expect(status).toBe(0);expect(launches).toBe(2);expect(await readFile(marker,'utf8')).toBe('serving');expect(logs.at(-1)).toMatchObject({event:'engine.supervisor_stopped'});
 }finally{clearInterval(timer);stop.abort();await rm(dir,{recursive:true,force:true});}
});
it('X-02: shutdown during backoff cancels restart; cleanup only removes locks owned by the reaped child',async()=>{
 const stop=new AbortController(),logs:Record<string,unknown>[]=[];
 await supervise({command:process.execPath,args:['-e','process.exit(1)'],signal:stop.signal,shutdownMs:100,log:e=>{logs.push(e);if(e.event==='engine.restart_scheduled')stop.abort();}});
 expect(logs.filter(e=>e.event==='engine.process_exited')).toHaveLength(1);expect(logs.some(e=>e.event==='engine.restarting')).toBe(false);
 const dir=await mkdtemp(join(tmpdir(),'engine-locks-'));try{const own=join(dir,'own.lock'),other=join(dir,'other.lock'),state=join(dir,'register.json');await writeFile(own,'123');await writeFile(other,'456');await writeFile(state,'evidence');expect(await releaseChildLocks([own,other,join(dir,'missing.lock')],123)).toBe(1);expect(await readFile(other,'utf8')).toBe('456');expect(await readFile(state,'utf8')).toBe('evidence');await expect(readFile(own)).rejects.toMatchObject({code:'ENOENT'});}finally{await rm(dir,{recursive:true,force:true});}
});

it('X-02: stable ready children replenish the budget beyond five failures',async()=>{
 const stop=new AbortController(),logs:Record<string,unknown>[]=[];let exits=0;
 const result=await supervise({command:process.execPath,args:['-e',"process.send({event:'engine.healthy'});setInterval(()=>process.send({event:'engine.healthy'}),20);setTimeout(()=>process.exit(1),120);"],signal:stop.signal,shutdownMs:100,stableMs:40,delays:[5,10],log:e=>logs.push(e),afterExit:async()=>{if(++exits===7)stop.abort();}});
 expect(result).toBe(0);expect(exits).toBe(7);expect(logs.filter(e=>e.event==='engine.restart_budget_reset')).toHaveLength(6);expect(logs.some(e=>e.event==='engine.restart_exhausted')).toBe(false);
});
it('X-02: surviving without readiness does not replenish the restart budget',async()=>{
 const logs:Record<string,unknown>[]=[];expect(await supervise({command:process.execPath,args:['-e','setTimeout(()=>process.exit(1),100)'],signal:new AbortController().signal,shutdownMs:100,stableMs:20,delays:[5],log:e=>logs.push(e)})).toBe(1);expect(logs.some(e=>e.event==='engine.restart_budget_reset')).toBe(false);expect(logs.at(-1)?.event).toBe('engine.restart_exhausted');
});
