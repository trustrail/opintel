import {load} from 'js-yaml';
/** Parse only bounded transport metadata, never eval console output or retain bodies. */
export function transportSamples(log,{startedAt,finishedAt,count=50}){
 const calls=new Map();let block='';
 const take=value=>{
  if(!value||typeof value!=='object'||typeof value.callId!=='string'||typeof value.path!=='string')return;
  if(value.event==='engine.transport_call_completed'){
   if(typeof value.durationMs==='number')calls.set(value.callId,{path:value.path,start:Date.parse(value.startedAt??value.timestamp),end:Date.parse(value.timestamp),durationMs:value.durationMs,summary:true,outcome:value.outcome==='ok'||value.outcome==='success'?'success':'failure'});
  }else if(value.event==='engine.transport_attempt_completed'){
   const start=Date.parse(value.attemptStartedAt),end=Date.parse(value.finishedAt);if(!Number.isFinite(start)||!Number.isFinite(end))return;
   const before=calls.get(value.callId);if(before?.summary)return;
   const first=Math.min(before?.start??start,start);calls.set(value.callId,{path:value.path,start:first,end,durationMs:end-first,outcome:value.outcome});
  }
 };
 for(const line of log.split('\n')){
  const text=line.trim();
  if(!block&&text.startsWith('{')&&text.endsWith('}')){try{take(JSON.parse(text));}catch{/* Non-transport log; no diagnostics include it. */}continue;}
  if(!block&&text==='{')block='{\n';else if(block){block+=text+'\n';if(line==='}'){try{take(load(block));}catch{/* Ignore unrelated/non-metadata objects. */}block='';}}
 }
 const start=Date.parse(startedAt),end=Date.parse(finishedAt);
 const paths=['/execute','/custody/attest','/health'];
 const results=paths.map(path=>{
  const selected=[...calls.values()].filter(v=>v.path===path&&v.start>=start&&v.end<=end).sort((a,b)=>a.start-b.start).slice(0,count);
  const durations=selected.filter(v=>v.outcome==='success').map(v=>v.durationMs).sort((a,b)=>a-b);
  const quantile=q=>durations.length?durations[Math.ceil(durations.length*q)-1]:null;
  return {path,selected:selected.length,passed:durations.length,failed:selected.length-durations.length,notExercised:Math.max(0,count-selected.length),p50Ms:quantile(.5),p95Ms:quantile(.95)};
 });
 return {status:results.every(v=>v.passed===count)?'passed':'failed',samplesPerPath:count,selection:'first completed calls per path in the isolated benchmark window; failures are retained',paths:results};
}

/** First retained public-call timings; invalid or missing samples cannot pass. */
export function publicLatency(samples,count=50){
 const selected=samples.slice(0,count),values=selected.filter(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0).sort((a,b)=>a-b);
 const quantile=q=>values.length?values[Math.ceil(values.length*q)-1]:null;
 return {status:values.length===count?'passed':'failed',selected:selected.length,passed:values.length,failed:selected.length-values.length,missing:Math.max(0,count-selected.length),p50Ms:quantile(.5),p95Ms:quantile(.95)};
}
