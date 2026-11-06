import {it,expect} from 'vitest';
import {transportSamples,publicLatency,transportRetryEvidence} from '../scripts/images/transport-benchmark.mjs';
const startedAt='2026-11-05T00:00:00.000Z',finishedAt='2026-11-05T00:00:10.000Z';
it('keeps the entire HTTP/1 retry lifetime and parses nested metadata without evaluating logs',()=>{
 const event=(attempt,start,end,outcome)=>`{\n  event: 'engine.transport_attempt_completed',\n  callId: 'one',\n  path: '/health',\n  attempt: ${attempt},\n  attemptStartedAt: '${start}',\n  finishedAt: '${end}',\n  outcome: '${outcome}',\n  durationsMs: {\n    total: 12\n  }\n}`;
 const result=transportSamples(event(1,startedAt,'2026-11-05T00:00:00.050Z','failure')+'\n'+event(2,'2026-11-05T00:00:00.070Z','2026-11-05T00:00:00.100Z','success'),{startedAt,finishedAt,count:1});
 expect(result.paths.find(p=>p.path==='/health')).toMatchObject({passed:1,failed:0,p50Ms:100,p95Ms:100});expect(result.status).toBe('failed');
});
it('counts missing/failed calls honestly and reads the new per-call summaries',()=>{
 const lines=['/health','/execute','/custody/attest'].flatMap(path=>[10,20,30,40,50].map((durationMs,i)=>JSON.stringify({event:'engine.transport_call_completed',callId:path+i,path,startedAt,timestamp:finishedAt,durationMs,outcome:i===4?'failure':'ok'}))).join('\n');
 const result=transportSamples(lines,{startedAt,finishedAt,count:5});expect(result.status).toBe('failed');for(const path of result.paths)expect(path).toMatchObject({selected:5,passed:4,failed:1,notExercised:0,p50Ms:20,p95Ms:40});
 expect(JSON.stringify(result)).not.toContain('callId');
});
it('passes only with all fifty calls for each path',()=>{
 const lines=['/execute','/custody/attest','/health'].flatMap(path=>Array.from({length:50},(_,i)=>JSON.stringify({event:'engine.transport_call_completed',callId:path+i,path,startedAt,timestamp:finishedAt,durationMs:i+1,outcome:'ok'}))).join('\n');
 const result=transportSamples(lines,{startedAt,finishedAt});expect(result.status).toBe('passed');expect(result.paths.every(p=>p.selected===50&&p.p50Ms===25&&p.p95Ms===48)).toBe(true);
});

it('reports public verify latency separately and never replaces invalid or missing samples',()=>{
 expect(publicLatency(Array.from({length:50},(_,n)=>n+1))).toMatchObject({status:'passed',selected:50,p50Ms:25,p95Ms:48});
 expect(publicLatency([null,...Array.from({length:50},(_,n)=>n+1)])).toMatchObject({status:'failed',selected:50,passed:49,failed:1,missing:0});
 expect(publicLatency([10])).toMatchObject({status:'failed',selected:1,missing:49,p50Ms:10,p95Ms:10});
});

it('reports TLS stalls as recovered only after a successful later attempt, retaining timings without payloads',()=>{
 const events=[{event:'unrelated',secret:'not-retained'},...['recovered','failed'].flatMap(callId=>[
  {event:'engine.transport_failed',callId,path:'/health',attempt:1,phase:'tls',reason:'connect_deadline',written:false,privateBody:'not-retained'},
  {event:'engine.transport_attempt_completed',callId,path:'/health',attempt:1,phase:'tls',outcome:'failure',attemptStartedAt:startedAt,tcpConnectedAt:startedAt,tlsCompletedAt:null,failedAt:finishedAt,durationsMs:{total:5000}},
  {event:'engine.transport_call_completed',callId,path:'/health',attempts:callId==='recovered'?2:1,outcome:callId==='recovered'?'ok':'failure'},
 ])];
 const result=transportRetryEvidence(events.map(value=>JSON.stringify(value)).join('\n'));
 expect(result).toMatchObject({completedCalls:2,failedAttempts:2,tlsStallCount:2,recoveredTlsStallCount:1,successfulCallsWithRetries:1});
 expect(result.tlsStalls.map(value=>[value.durationMs,value.recovered])).toEqual([[5000,true],[5000,false]]);
 expect(result.tlsStalls[0]).toMatchObject({tcpConnectedAt:startedAt,tlsCompletedAt:null,failedAt:finishedAt});
 expect(JSON.stringify(result)).not.toContain('not-retained');
});
