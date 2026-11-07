import {afterEach,expect,it,vi} from 'vitest';
const histogram=vi.hoisted(()=>({enable:vi.fn(),disable:vi.fn(),reset:vi.fn(),count:10,mean:25000000,max:60000000,percentile:vi.fn(()=>50000000)}));
vi.mock('node:perf_hooks',()=>({monitorEventLoopDelay:()=>histogram}));
import {sampleEngineRuntime} from '../sidecar/infrastructure/runtime-sampling.js';
import {healthResponse} from '../src/shared/sidecar-contract.js';
import {EngineView} from '../src/shared/api/engines.js';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();histogram.count=10;histogram.mean=25000000;});
it('samples actual scheduling windows in milliseconds and releases the timer and histogram',()=>{
 vi.useFakeTimers();const log=vi.fn(),sampler=sampleEngineRuntime(log);expect(sampler.snapshot()).toBeUndefined();
 vi.advanceTimersByTime(1000);expect(log).toHaveBeenCalledTimes(1);expect(sampler.snapshot()).toMatchObject({samples:10,windowMs:1000,eventLoop:{meanMs:25,p99Ms:50,maxMs:60}});expect(histogram.reset).toHaveBeenCalled();
 sampler.close();vi.advanceTimersByTime(2000);expect(log).toHaveBeenCalledTimes(1);expect(histogram.disable).toHaveBeenCalled();
});
it('reports missing measurements as null, never NaN or a fabricated zero',()=>{
 vi.useFakeTimers();histogram.count=0;histogram.mean=NaN;const sampler=sampleEngineRuntime(()=>{});try{vi.advanceTimersByTime(1000);expect(sampler.snapshot()?.eventLoop).toEqual({meanMs:null,p99Ms:null,maxMs:null});}finally{sampler.close();}
});
it('existing health and engine read contracts admit only public runtime metadata',()=>{
 const runtime={sampledAt:'2026-11-07T04:00:46.306Z',windowMs:11000,samples:10,eventLoop:{meanMs:100,p99Ms:10000,maxMs:10000}};
 expect(healthResponse.parse({version:'1.0.0',contract:3,queryEngineVersion:'test',canonicalisers:[],runtime}).runtime).toEqual(runtime);
 expect(EngineView.shape.runtime.parse(runtime)).toEqual(runtime);
 expect(healthResponse.safeParse({version:'1.0.0',contract:3,queryEngineVersion:'test',canonicalisers:[],runtime:{...runtime,sql:'private'}}).success).toBe(false);
});

it('a late sampling callback reports the full delayed window',()=>{
 vi.useFakeTimers();vi.spyOn(performance,'now').mockReturnValueOnce(0).mockReturnValueOnce(11000);const sampler=sampleEngineRuntime(()=>{});try{vi.advanceTimersByTime(1000);expect(sampler.snapshot()?.windowMs).toBe(11000);}finally{sampler.close();}
});
