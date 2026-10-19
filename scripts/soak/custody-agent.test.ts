import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {custodyAgents,type ExchangeState} from './custody.js';
import {certificateSlots,certificateMapping,certificateForAgent} from './manifest.js';
import {exchangeDue,exchangeRetryMs} from './exchange-policy.js';
test('four fixed names and ten-agent distribution; never invent or vary a device name',()=>{
 const mapping=certificateSlots.map(s=>({...s,bundlePath:'/missing'})).map(({poolIndex:_,...s})=>s);
 assert.equal(certificateMapping.safeParse(mapping).success,true);
 assert.equal(certificateMapping.safeParse(mapping.map((s,i)=>i===0?{...s,deviceName:'new-seat'}:s)).success,false);
 assert.deepEqual([0,1].map(pool=>Array.from({length:5},(_,i)=>certificateForAgent(pool,i).certificateId)),[[223,224,223,224,223],[225,226,225,226,225]]);
});
test('failed exchanges retry after five minutes, not on every query; valid tokens wait for renewal',()=>{
 const state={ok:false,nextAttempt:1000+exchangeRetryMs};assert.equal(exchangeDue(undefined,undefined,1000),true);assert.equal(exchangeDue(state,undefined,state.nextAttempt-1),false);assert.equal(exchangeDue(state,undefined,state.nextAttempt),true);assert.equal(exchangeDue({ok:true,nextAttempt:0},1000,1000),false);assert.equal(exchangeDue({ok:true,nextAttempt:0},1000,970000),true);
});
test('all four missing bundles fail cleanly once; MCP agents still connect and custody does not attempt redemption',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'soak-device-test-')),mapping=certificateSlots.map(({certificateId,deviceName})=>({certificateId,deviceName,bundlePath:join(directory,'missing-'+certificateId)}));
 const file=join(directory,'mapping.json');await writeFile(file,JSON.stringify(mapping),{mode:0o600});
 const methods:string[]=[];const server=createServer(async(req,res)=>{
  assert.equal(req.headers.cookie,undefined);if(req.method!=='POST'){res.writeHead(405).end();return;}
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const message=JSON.parse(Buffer.concat(chunks).toString()) as {id?:number;method:string};methods.push(message.method);
  if(message.id===undefined){res.writeHead(202).end();return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2025-03-26',capabilities:{},serverInfo:{name:'mock-mcp',version:'1'}}}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const states:ExchangeState[]=[];const agent=custodyAgents(file,'synthetic-api-key',()=>{},state=>states.push(state));
 try{for(let i=0;i<10;i++){const slot=certificateForAgent(i<5?0:1,i%5),association=mapping.find(m=>m.certificateId===slot.certificateId)!;await agent.connect(i,`http://127.0.0.1:${address.port}/mcp`,'synthetic-pool-key','synthetic-agent-'+i,association);}
  assert.equal(states.length,4);assert.ok(states.every(s=>!s.ok&&s.reason==='bundle_failed'));
  const result=await agent.complete(0,{columns:[],rows:[],truncated:false,evidenceId:'10000000-0000-4000-8000-000000000001'},{});assert.equal(result.ok,false);assert.equal(result.stage,'certificate');assert.equal(methods.filter(m=>m==='initialize').length,10);assert.equal(methods.includes('tools/call'),false);assert.equal(states.length,4);
 }finally{await agent.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});


import {deviceAssociation} from './device-subject.js';
test('recipient comes only from sub, verbatim; no name pattern or other claim fallback',()=>{
 assert.equal(deviceAssociation({sub:'provider-issued-opaque-subject',other:'ignored'},223,'opintelprobe').recipientIdentifier,'provider-issued-opaque-subject');
 for(const payload of [{other:'provider-issued-opaque-subject'},{sub:''},{sub:123},null])assert.throws(()=>deviceAssociation(payload,223,'opintelprobe'));
 const mapping=certificateSlots.map(({certificateId,deviceName})=>({certificateId,deviceName,bundlePath:'/missing'}));
 assert.equal(certificateMapping.safeParse(mapping.map(m=>({...m,recipientIdentifier:'must-not-be-configured'}))).success,false);
});
