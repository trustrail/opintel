import {monitorEventLoopDelay} from 'node:perf_hooks';
import type {EngineRuntimeSample} from '../../src/shared/engine-runtime.js';
/** Measures scheduling delay, including host descheduling; it does not identify its cause. */
export function sampleEngineRuntime(log:(sample:EngineRuntimeSample)=>void=sample=>console.info(JSON.stringify({event:'engine.runtime_sample',...sample}))){
 const histogram=monitorEventLoopDelay({resolution:20});histogram.enable();
 let started=performance.now(),latest:EngineRuntimeSample|undefined;
 const timer=setInterval(()=>{
  const now=performance.now(),samples=histogram.count;
  const ms=(value:number)=>samples>0&&Number.isFinite(value)?Math.max(0,value/1e6):null;
  latest={sampledAt:new Date().toISOString(),windowMs:Math.max(0,now-started),samples,eventLoop:{meanMs:ms(histogram.mean),p99Ms:ms(histogram.percentile(99)),maxMs:ms(histogram.max)}};
  histogram.reset();started=now;log(latest);
 },1000);timer.unref();
 return {snapshot:()=>latest,close:()=>{clearInterval(timer);histogram.disable();}};
}
