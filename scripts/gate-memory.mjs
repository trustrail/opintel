import {setInterval,clearInterval} from 'node:timers';
import {availableMemory} from './gate-preflight.mjs';

export function gateMemoryMonitor({read=availableMemory,intervalMs=5000,now=()=>new Date().toISOString()}={}){
 const state={startAvailableBytes:null,minimumAvailableBytes:null,minimumAt:null,lastSampleAt:null,samples:0,failedSamples:0,intervalMs};
 let timer,pending;
 async function sample(){
  const bytes=await read();
  if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Gate memory sample is invalid.');
  const at=now();
  state.startAvailableBytes??=bytes;
  if(state.minimumAvailableBytes===null||bytes<state.minimumAvailableBytes){state.minimumAvailableBytes=bytes;state.minimumAt=at;}
  state.lastSampleAt=at;state.samples++;
 }
 async function observe(){try{await sample();}catch{state.failedSamples++;}}
 return {
  snapshot:()=>({...state}),
  async start(onSample=()=>{}){
   try{await sample();}catch(error){state.failedSamples++;throw error;}
   timer=setInterval(()=>{
    if(pending)return;
    pending=observe().then(onSample).finally(()=>{pending=undefined;});
   },intervalMs);
   timer.unref();
  },
  async stop(){clearInterval(timer);await pending;if(state.samples>0)await observe();},
 };
}
