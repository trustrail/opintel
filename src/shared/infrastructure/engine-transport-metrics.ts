import type {ProjectId} from '../kernel/value-objects.js';
import {engineTransportPaths,engineTransportSampleWindow,type EngineTransportLatency} from '../engine-transport-telemetry.js';
const window=engineTransportSampleWindow;
type Samples={count:number;failed:number;values:number[];lastMs:number;lastAt:string};
const engines=new Map<string,{since:string;paths:Map<(typeof engineTransportPaths)[number],Samples>}>();
const identity=(address:string,pin:string,project?:ProjectId)=>(project??'unscoped')+'|'+new URL(address).origin+'|'+pin.replaceAll(':','').toUpperCase();
/** Bounded operational telemetry; no customer data, SQL or credential labels. */
export function recordEngineTransport(address:string,pin:string,path:string,durationMs:number,failed:boolean,project?:ProjectId):void{
 if(!Number.isFinite(durationMs)||durationMs<0)return;
 const key=identity(address,pin,project),at=new Date().toISOString();let engine=engines.get(key);
 if(!engine){if(engines.size>=1024)engines.delete(engines.keys().next().value!);engine={since:at,paths:new Map()};engines.set(key,engine);}
 const label=engineTransportPaths.find(value=>value===path)??'/other';let samples=engine.paths.get(label);
 if(!samples){samples={count:0,failed:0,values:[],lastMs:durationMs,lastAt:at};engine.paths.set(label,samples);}
 samples.count++;if(failed)samples.failed++;samples.values.push(durationMs);if(samples.values.length>window)samples.values.shift();samples.lastMs=durationMs;samples.lastAt=at;
}
export function engineTransportLatency(address:string,pin:string,project?:ProjectId):EngineTransportLatency|null{
 const engine=engines.get(identity(address,pin,project));if(!engine)return null;
 return {since:engine.since,sampleWindow:window,paths:[...engine.paths].map(([path,value])=>{const sorted=[...value.values].sort((a,b)=>a-b);return {path,count:value.count,failed:value.failed,p50Ms:sorted[Math.ceil(sorted.length*.5)-1]!,p95Ms:sorted[Math.ceil(sorted.length*.95)-1]!,lastMs:value.lastMs,lastAt:value.lastAt};})};
}
export function clearEngineTransportMetrics():void{engines.clear();}
