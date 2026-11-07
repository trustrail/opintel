import process from 'node:process';
import console from 'node:console';
// Retained-log analysis only. Never prints request bodies, source addresses or values.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const directory=process.argv[2];if(!directory)throw new Error('Provide the retained acceptance directory.');
const lines=readFileSync(join(directory,'engine-services.log'),'utf8').split('\n');
const engine=lines.map(line=>line.startsWith('engine-1')?line.replace(/^engine-1\s*\| ?/u,''):'').join('\n');
const field=(text,key)=>text.match(new RegExp(`\\b${key}: '([^']*)'`,'u'))?.[1];
const number=(text,key)=>{const value=text.match(new RegExp(`\\b${key}: ([0-9.e+-]+)`,'u'))?.[1];return value===undefined?undefined:Number(value);};
const entries=[...engine.matchAll(/^\{[\s\S]*?^\}/gmu)].map(match=>({text:match[0],event:field(match[0],'event'),at:field(match[0],'timestamp'),requestId:field(match[0],'requestId'),callId:field(match[0],'callId'),phase:field(match[0],'phase'),state:field(match[0],'state')}));
const outputDirectory=join(directory,'verification/output'),runDirectory=readdirSync(outputDirectory).find(name=>name.startsWith('soak-run-'));
const receiptPools=new Map(),refusals=[];if(runDirectory){const logs=join(outputDirectory,runDirectory,'soak');for(const file of readdirSync(logs).filter(name=>name.endsWith('.jsonl'))){for(const line of readFileSync(join(logs,file),'utf8').trim().split('\n')){const item=JSON.parse(line);if(item.type==='query'&&item.response?._meta?.evidenceId==='01a1b422-0c08-7fa5-a031-705fbf182121'){const meta=item.response._meta;refusals.push({responseEvidenceId:meta.evidenceId,code:meta.code,cause:meta.cause,cancellationOrigin:meta.cancellationOrigin,retryable:meta.retryable});}if(item.type==='receipt'){receiptPools.set(item.id,item.detail.poolId);if(item.id==='01a1b422-0c08-7fa5-a031-705fbf182121')refusals.push({receiptId:item.id,recordedStatus:item.detail.status,recordedRefusalCode:item.detail.refusalCode});}}}}
const querySettings=JSON.parse(readFileSync(join(outputDirectory,'operator.json'),'utf8')).settings.query;
const calls=['766d2caf-c79d-4ecb-9c76-57d30f57c46e','19c99f49-9b31-4c80-9e4a-70012638a52e'];
const phases=entries.filter(entry=>entry.event==='engine.request_phase');
const admitted=new Map();for(const entry of entries){if(entry.event==='engine.queue_wait'&&entry.text.includes('admitted: true')&&entry.requestId&&entry.at)admitted.set(entry.requestId,entry.at);}
const ends=new Map();for(const entry of phases){if(entry.phase==='respond'&&['end','aborted'].includes(entry.state)&&entry.requestId&&entry.at)ends.set(entry.requestId,entry.at);}
const windows=[['execute','2026-11-07T03:51:33.263Z','2026-11-07T03:52:04.680Z'],['health','2026-11-07T04:00:36.089Z','2026-11-07T04:00:46.306Z']];
const output={refusals,queryLimits:{concurrencyPerPool:querySettings.concurrencyPerPool,timeoutSeconds:querySettings.timeoutSeconds},calls:calls.map(callId=>({callId,phases:phases.filter(e=>e.callId===callId).map(({at,requestId,phase,state})=>({at,requestId,phase,state}))})),windows:windows.map(([name,start,end])=>{
 const overlap=[...admitted].filter(([id,at])=>at<=end&&(ends.get(id)??'')>=start).map(([requestId,at])=>({requestId,poolId:receiptPools.get(requestId),admittedAt:at,responseAt:ends.get(requestId)}));
 const boundaries=[start,...overlap.flatMap(row=>[row.admittedAt,row.responseAt]).filter(at=>at>=start&&at<=end)];
 return {name,start,end,observedAdmittedRequests:overlap,upperBoundAdmittedUnresponded:Math.max(0,...boundaries.map(at=>overlap.filter(row=>row.admittedAt<=at&&row.responseAt>at).length)),sourceLeases:entries.filter(e=>e.event==='engine.source_connections'&&e.at>=start&&e.at<=end).map(e=>({at:e.at,activeLeases:number(e.text,'activeLeases'),limit:number(e.text,'limit')})),queueWaits:entries.filter(e=>e.event==='engine.queue_wait'&&e.at>=start&&e.at<=end).map(e=>({at:e.at,requestId:e.requestId,waitMs:number(e.text,'queueWaitMs'),admitted:e.text.includes('admitted: true')}))};}),limitations:['Admitted-through-response overlap is not a native DuckDB instance count or exact release time.','No reconstruction of unretained event-loop delay, Docker stats, host load or cgroup CPU throttling.']};
console.log(JSON.stringify(output,null,2));
