import {Coverage,type Specification,type Scenario} from './specification.js';
import {scenarioPlan,discoveryMismatches,declaredMask,scenarioValuesMatch} from './scenarios.js';
import {certificateForAgent} from './manifest.js';
/** Manual exploration, never a test tier. Composer sees MCP metadata only;
 * the separate oracle reads the synthetic V-01 definition to detect disclosure. */
import {parseArgs} from 'node:util';
import {mkdir,open,readFile} from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';
import type {freshNormalSpiceDb,seedNormalPostgres} from '../testing/normal-environment.js';
import {DescribeOutput,QueryOutput} from '../../src/shared/api/mcp.js';
import type {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import {createObserver,ObserverFailure} from './observer.js';
import type {ExchangeState,custodyAgents} from './custody.js';
import type {externalTarget} from './external.js';
import {RunId} from '../../src/shared/kernel/index.js';
import type {reinsuranceConformance} from '../../test/fixtures/reinsurance/conformance.js';
import pack from '../../src/modules/sources/demo/reinsurance.json' with {type:'json'};
const definition=pack.conformance;
import type {z} from 'zod';

type ObjectInfo=z.infer<typeof DescribeOutput>['objects'][number];
type Column=ObjectInfo['columns'][number];
type Selection={object:ObjectInfo;column:Column;alias:string;side:string};
type Plan={sql:string;kind:string;selected:Selection[];objects:ObjectInfo[];join?:string;aggregate?:Column;filter?:string};
const terminalLog=console.log.bind(console),terminalError=console.error.bind(console);
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const table=(s:string)=>s.split('.').map(quote).join('.');
function random(seed:number){let state=seed>>>0;return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function compose(objects:ObjectInfo[],rng:()=>number):Plan{
 const pick=<T>(items:T[])=>items[Math.floor(rng()*items.length)]!;
 const object=pick(objects),mode=Math.floor(rng()*6);
 const pairs=objects.flatMap(a=>objects.filter(b=>a.name.split('.')[0]!==b.name.split('.')[0]).flatMap(b=>a.columns.filter(c=>c.treatment==='tokenized'&&b.columns.some(d=>d.name===c.name&&d.treatment==='tokenized'&&d.type===c.type)).map(c=>({a,b,c}))));
 if(mode===0&&pairs.length){const {a,b,c}=pick(pairs);const selected:Selection[]=[...a.columns.filter(x=>x.treatment==='clear'||x.name===c.name).map(column=>({object:a,column,alias:'a_'+column.name,side:'a' as const})),...b.columns.filter(x=>x.treatment==='clear'||x.name===c.name).map(column=>({object:b,column,alias:'b_'+column.name,side:'b' as const}))];return {kind:'join',objects:[a,b],join:c.name,selected,sql:`SELECT ${selected.map(s=>`${s.side}.${quote(s.column.name)} AS ${quote(s.alias)}`).join(',')} FROM ${table(a.name)} a JOIN ${table(b.name)} b ON a.${quote(c.name)}=b.${quote(c.name)}`};}
 const numeric=object.columns.filter(c=>/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/i.test(c.type));
 if(mode===1&&numeric.length){const c=pick(numeric);return {kind:'aggregate',objects:[object],selected:[],aggregate:c,sql:`SELECT COUNT(${quote(c.name)}) AS n,SUM(${quote(c.name)}) AS total FROM ${table(object.name)}`};}
 if(mode===2&&object.withheld.length)return {kind:'withheld probe',objects:[object],selected:[],sql:`SELECT ${quote(pick(object.withheld))} FROM ${table(object.name)}`};
 // Clear columns anchor every returned row for the independent fixture oracle.
 const selected=object.columns.filter(c=>c.treatment==='clear'||rng()<0.5).map(column=>({object,column,alias:column.name,side:'a' as const}));
 if(!selected.length&&object.columns[0])selected.push({object,column:object.columns[0],alias:object.columns[0].name,side:'a'});
 const filter=mode===3?pick(object.columns.filter(c=>c.treatment==='clear'))?.name:undefined;
 return {kind:filter?'filtered projection':'projection',objects:[object],selected,filter,sql:`SELECT ${selected.length?selected.map(s=>quote(s.column.name)).join(','):'*'} FROM ${table(object.name)}${filter?` WHERE ${quote(filter)} IS NOT NULL`:''}`};
}
const {values}=parseArgs({options:{agents:{type:'string',default:'10'},duration:{type:'string'},rate:{type:'string',default:'750'},seed:{type:'string',default:'1'},pool:{type:'string'},help:{type:'boolean'},target:{type:'string'},manifest:{type:'string',default:'tmp/dev-demo/soak.json'},'observer-cookie':{type:'string'},custody:{type:'boolean'},certs:{type:'string'}},strict:true});
if(values.help){terminalLog('node --import tsx scripts/soak/reinsurance.ts [--agents 10] [--duration seconds] [--rate 750] [--seed 1] [--pool "Cedant 01"|"Cedant 02"] [--target http://127.0.0.1:3000 --manifest tmp/dev-demo/soak.json --observer-cookie /outside/repo/cookie --custody --certs /outside/repo/certificates.json]');process.exit(0);}
const integer=(v:string,name:string,min:number)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min)throw new Error(name+' must be an integer >= '+min);return n;};
const count=integer(values.agents,'agents',1),rate=integer(values.rate,'rate',0),seed=integer(values.seed,'seed',0),duration=values.duration?integer(values.duration,'duration',1):undefined;
if(values.pool&&!['Cedant 01','Cedant 02'].includes(values.pool))throw new Error('pool must be Cedant 01 or Cedant 02');
if(values.custody&&(!values.target||!values.certs))throw new Error('--custody requires --target and --certs');
let stopping=false;const stop=new AbortController();const halt=()=>{stopping=true;stop.abort();};process.on('SIGINT',halt);process.on('SIGTERM',halt);
const counters:Record<string,Record<string,number>>={agents:{},pools:{},outcomes:{},treatments:{},refusals:{}};
const bump=(group:string,key:string,n=1)=>{const map=counters[group]!;map[key]=(map[key]??0)+n;};
let breaches=0,joins=0,matched=0,errors=0;const latencies=new Map<number,number>();
const seenTreatments=new Map<string,string>(),tokens=new Map<string,unknown>();
const path=`tmp/soak/${new Date().toISOString().replaceAll(':','-')}-${process.pid}.jsonl`;
await mkdir('tmp/soak',{recursive:true});const log=await open(path,'wx',0o600);
const safe=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(safe);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/^(grant|share|access_token|tenant|recipientIdentifier|cookie)$/iu.test(key)?'[redacted]':safe(v)]));if(typeof value==='string')return value.replace(/"(tenant|recipientIdentifier|grant|share|access_token)"\s*:\s*"[^"]*"/gu,'"$1":"[redacted]"').replace(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+/gu,'[address redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu,'[token redacted]');return value;};
let writes=Promise.resolve();const record=(entry:unknown)=>{writes=writes.then(async()=>{await log.write(JSON.stringify(safe(entry))+'\n');});return writes;};
// Keep the terminal readable; retain Engine/Application diagnostics in JSONL.
for(const level of ['log','info','warn','error','debug'] as const)console[level]=(...args:unknown[])=>{void record({type:'diagnostic',level,args}).catch(()=>{terminalError('JSONL write failed');halt();});};
const alarm=async(message:string,context:unknown)=>{breaches++;terminalError('\n!!! INVARIANT BREACH: '+message+'\n'+JSON.stringify(safe(context),null,2));await record({type:'alarm',message,context});};
let observer:Awaited<ReturnType<typeof createObserver>>|undefined,custody:ReturnType<typeof custodyAgents>|undefined,external:Awaited<ReturnType<typeof externalTarget>>|undefined;
let custodyVerified=0,custodyRefused=0,custodySkipped=0;
const exchanges=new Map<number,ExchangeState>();
const custodyByAgent:Record<string,{certificateId:number|null;deviceName:string|null;offered:number;completed:number;ordinaryAnswers:number;ordinaryAnswersWhileExchangeUnavailable:number}>={};
let spice:Awaited<ReturnType<typeof freshNormalSpiceDb>>|undefined,baseline:Awaited<ReturnType<typeof seedNormalPostgres>>|undefined,f:Awaited<ReturnType<typeof reinsuranceConformance>>|undefined;
let spec:Specification|undefined,coverage:Coverage|undefined;
const rowsFor=(object:ObjectInfo):Record<string,unknown>[]=>{if(spec){const rows=spec.objects.filter(o=>o.name===object.name).flatMap(o=>o.rows);return rows;}const name=object.name.split('.').at(-1);if(!name||!(name in definition))throw new Error('Oracle has no fixture object '+object.name);const rows=definition[name as keyof typeof definition];if(!Array.isArray(rows)||rows.some(r=>typeof r!=='object'))throw new Error('Oracle cannot inspect '+object.name);return rows as Record<string,unknown>[];};
const eligible=(object:ObjectInfo,pool:number)=>spec?spec.objects.find(o=>o.name===object.name&&o.poolIndex===pool)?.rows??[]:rowsFor(object).filter(r=>'cedant' in r&&r.cedant===definition.cedants[pool]);
let literals=Object.values(definition).flatMap(v=>Array.isArray(v)?v.flatMap(r=>typeof r==='object'&&r!==null?Object.values(r).filter((x):x is string=>typeof x==='string') : typeof r==='string'?[r]:[]):[]);
try{
 type Agent={poolIndex:number;pool:string;credentialId:string;key:string;association?:CertificateAssociation};
 type Connection=Awaited<ReturnType<Awaited<ReturnType<typeof externalTarget>>['connect']>>;
 let available:Agent[],connect:(key:string,id:string)=>Promise<Connection>;
 let receiptRead:(id:string,agentId:string)=>Promise<{receipt:{agent_id:string|null;pool_id:string;credential_id:string|null|undefined};detail:unknown}|null|undefined>;
 if(values.target){
  const {externalTarget}=await import('./external.js');external=await externalTarget(values.target,values.manifest);
  observer=createObserver(external.base,external.manifest.projectId,values['observer-cookie'],terminalError,halt);await observer.ready();
  const receiptObserver=observer;receiptRead=async(id,agentId)=>{const detail=await receiptObserver.read(id,agentId);return detail?{receipt:{agent_id:detail.agentId,pool_id:detail.poolId,credential_id:detail.credentialId},detail}:detail;};
  available=external.agents;connect=external.connect;spec=external.manifest.specification!;coverage=new Coverage(spec.scenarios);literals=spec.literals;
 }else{
  const {loadDevEnvironment}=await import('../dev-environment.js');const {freshNormalSpiceDb,seedNormalPostgres}=await import('../testing/normal-environment.js');const {testPreflight}=await import('../service-readiness.js');
  const environment=loadDevEnvironment();spice=await freshNormalSpiceDb(environment);process.env.SPICEDB_ENDPOINT=spice.endpoint;process.env.SPICEDB_TOKEN=spice.token;
  await testPreflight({...environment,spiceDbEndpoint:spice.endpoint,spiceDbToken:spice.token});baseline=await seedNormalPostgres(environment);process.env.DATABASE_URL=environment.testDatabaseUrl;
  const {withTenant}=await import('../../src/platform/db/scope.js');
  const {PostgresEvidenceReader}=await import('../../src/modules/evidence/index.js');
  const {unwrap}=await import('../../test/fixtures/query/fixture.js');
  const {reinsuranceConformance:createFixture}=await import('../../test/fixtures/reinsurance/conformance.js');
  f=await createFixture();const fixture=f;available=fixture.agents;connect=fixture.connect;
  receiptRead=async id=>{const receipts=await withTenant(fixture.ctx,tx=>tx.query<{at:string;agent_id:string;pool_id:string;credential_id:string}>('SELECT r.started_at::text AS at,r.agent_id,r.pool_id,r.credential_id FROM query_run r JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.id=$1',[id]));const receipt=receipts[0];return receipts.length===1&&receipt?{receipt,detail:unwrap(await new PostgresEvidenceReader().detail(fixture.ctx,RunId(id),receipt.at))}:null;};
 }
 const ordered=values.pool?available.filter(a=>values.pool===`Cedant 0${a.poolIndex+1}`):Array.from({length:5},(_,i)=>[available.filter(a=>a.poolIndex===0)[i]!,available.filter(a=>a.poolIndex===1)[i]!]).flat();
 const agents=await Promise.all(Array.from({length:count},async(_,i)=>{const a=ordered[i%ordered.length]!;const agentId=`soak-${process.pid}-${i+1}`;return {...a,device:certificateForAgent(a.poolIndex,available.filter(v=>v.poolIndex===a.poolIndex).indexOf(a)),...await connect(a.key,agentId),agentId,index:i};}));
 for(const a of agents)custodyByAgent[a.agentId]={certificateId:a.device.certificateId,deviceName:a.device.deviceName,offered:0,completed:0,ordinaryAnswers:0,ordinaryAnswersWhileExchangeUnavailable:0};
 terminalLog(`Soak: ${count} callers; seed ${seed}; JSONL ${path}. Ctrl-C drains in-flight requests. ${values.target?'EXTERNAL: no service startup or database access.':'Uses/reset TEST database only.'}`);
 let hasCustody=false;
 for(const pool of new Set(agents.map(a=>a.pool))){const agent=agents.find(a=>a.pool===pool)!;const response=await agent.client.callTool({name:'opintel.describe',arguments:{}});await record({type:'startup-describe',agent:agent.agentId,response});const discovered=DescribeOutput.parse(response.structuredContent);hasCustody ||= discovered.objects.some(o=>o.columns.some(c=>c.treatment==='custody'));if(external)for(const o of discovered.objects)if(!external.manifest.objects[o.name])throw new Error('Discovered object is outside the seeded oracle: '+o.name);}
 if(!hasCustody)terminalLog('NO CUSTODY COLUMN in the selected pools; no redemption will be exercised.');
 if(values.custody&&hasCustody){
  const {parse}=await import('dotenv');let key=process.env.OPINTEL_XQ_API_KEY;
  if(!key)try{key=parse(await readFile('.env','utf8')).OPINTEL_XQ_API_KEY;}catch{/* Missing agent XQ configuration is reported as custody unavailability. */}
  key??='';
  const {custodyAgents}=await import('./custody.js');custody=custodyAgents(values.certs!,key,event=>{terminalLog(`${new Date().toISOString()} custody agent=${event.agent+1} ${event.event} status=${event.status}`);void record({type:'custody',...event});},(state,startup)=>{exchanges.set(state.certificateId,state);terminalLog(`${new Date().toISOString()} certificate=${state.certificateId} device=${state.deviceName} ${startup?'startup':'retry'} exchange=${state.ok?'succeeded':'unavailable'} status=${state.status??'local'} reason=${state.reason??'none'}${state.body?' body='+JSON.stringify(safe(state.body)):''}`);void record({type:'certificate-exchange',startup,...state});});
  for(const agent of agents){await custody.connect(agent.index,new URL(`/mcp/v1/p/${external!.manifest.projectId}`,external!.base).href,agent.key,agent.agentId,agent.device,agent.association);}
 }
 // Lifecycle probes use dedicated seeded keys, never mutate credentials here.
 if(external&&spec&&coverage){for(const scenario of spec.scenarios.filter(s=>s.credential!=='normal')){
  const credential=external.manifest.lifecycle?.[scenario.credential];
  if(!credential){terminalError('NOT EXERCISED '+scenario.id+': missing seeded lifecycle credential');continue;}
  if(values.pool&&values.pool!==`Cedant 0${scenario.poolIndex+1}`)continue;
  if(scenario.credential==='retiring'&&(!credential.graceUntil||Date.parse(credential.graceUntil)<=Date.now())){terminalError('NOT EXERCISED '+scenario.id+': retirement grace window expired; rerun operator setup');continue;}
  const agentId='soak-'+process.pid+'-'+scenario.credential;
  if(scenario.credential==='revoked'){
   const response=await fetch(new URL(`/mcp/v1/p/${external.manifest.projectId}`,external.base),{method:'POST',headers:{authorization:'Bearer '+credential.key,'x-opintel-agent-id':agentId,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'soak-revoked',version:'1'}}}),signal:AbortSignal.timeout(15000),redirect:'error'});
   const body:unknown=await response.json();const code=body&&typeof body==='object'&&'error' in body&&body.error&&typeof body.error==='object'&&'code' in body.error?String(body.error.code):'unexpected_response';const actual={outcome:response.status===401?code:'unexpected_http_'+response.status};
   if(!coverage.observe(scenario,actual))await alarm('Revoked credential accepted or wrong refusal',{scenario:scenario.id,expected:scenario.expected,actual});await record({type:'scenario',scenario:scenario.id,expected:scenario.expected,actual,status:response.status});continue;
  }
  const client=await external.connect(credential.key,agentId);const response=await client.query(scenario.sql);const output=QueryOutput.safeParse(response.structuredContent);const actual={outcome:response.isError?String(response._meta?.code):'success',rowCount:output.success?output.data.rows.length:undefined};
  if(!coverage.observe(scenario,actual))await alarm('Retiring credential outcome mismatch',{scenario:scenario.id,expected:scenario.expected,actual});
  await record({type:'scenario',scenario:scenario.id,expected:scenario.expected,actual,response});
  if(output.success){const out=output.data;const column=scenario.columns.find(c=>spec!.objects.find(o=>o.name===c.object&&o.poolIndex===0)?.columns.find(v=>v.name===c.name)?.treatment==='custody')!;const i=out.columns.findIndex(c=>c.name===column.alias);
   if(!out.custody?.length||out.rows.some(r=>typeof r[i]!=='string'||!String(r[i]).startsWith('opintelsealed:v1:')))await alarm('Retiring credential custody was not sealed',{scenario:scenario.id});
   if(custody&&credential.association){await custody.connect(count+1,new URL(`/mcp/v1/p/${external.manifest.projectId}`,external.base).href,credential.key,agentId,credential.association,credential.association);const anchor=scenario.columns.find(c=>c.name!==column.name)!;const expected=out.rows.map(row=>{const raw=scenario.expected.rows!.filter(r=>r[anchor.name]===row[out.columns.findIndex(c=>c.name===anchor.alias)]);const values=[...new Set(raw.map(r=>r[column.name]))];if(values.length!==1)throw new Error('Lifecycle oracle needs an unambiguous row anchor');return values[0];});const result=await custody.complete(count+1,out,{[column.alias]:expected});await record({type:'custody-result',agent:agentId,result});if(!result.ok)await alarm('Retiring credential custody did not complete',{scenario:scenario.id,result});}
   const receipt=await receiptRead(out.evidenceId,agentId);if(receipt===null)await alarm('Lifecycle receipt missing',{scenario:scenario.id});else if(receipt&&(receipt.receipt.credential_id!==credential.credentialId||receipt.receipt.pool_id!==credential.pool||receipt.receipt.agent_id!==agentId||literals.some(v=>JSON.stringify(receipt.detail).includes(JSON.stringify(v)))))await alarm('Lifecycle receipt ownership or literals mismatch',{scenario:scenario.id});
  }
 }}
 await record({type:'start',seed,count,rate,duration,pool:values.pool,target:values.target??'self-contained',fixture:'V-01',reproducibility:'Per-agent query choices are seeded; concurrent completion order and wall-clock duration are not deterministic.'});
 const timer=duration?setTimeout(halt,duration*1000):undefined;
 try{await Promise.all(agents.map(async agent=>{
  const rng=random(seed+agent.index+1),pool=`Cedant 0${agent.poolIndex+1}`;let sequence=0;
  while(!stopping){
   const at=new Date().toISOString();let plan:Plan|undefined,declared:Scenario|undefined;
   try{
    const describe=await agent.client.callTool({name:'opintel.describe',arguments:{}});await record({type:'describe',at,agent:agent.agentId,pool,response:describe});
    const discovery=DescribeOutput.parse(describe.structuredContent);
    if(spec)for(const mismatch of discoveryMismatches(spec,agent.poolIndex,discovery.objects))await alarm('Discovery differs from seeder declaration',mismatch);
    for(const o of discovery.objects)for(const c of [...o.columns,...o.withheld.map(name=>({name,treatment:'withheld'}))]){const key=`${pool}/${o.name}/${c.name}`,previous=seenTreatments.get(key);if(previous&&previous!==c.treatment)await alarm('Treatment changed',{key,previous,current:c.treatment});seenTreatments.set(key,c.treatment);}
    if(!discovery.objects.length)throw new Error('Discovery returned no objects');
    plan=compose(discovery.objects,rng);if(sequence===0&&values.custody){const ordinary=discovery.objects.find(o=>o.columns.some(c=>c.treatment==='masked')&&o.columns.some(c=>c.treatment==='tokenized'))??discovery.objects.find(o=>o.columns.some(c=>c.treatment==='clear'));if(ordinary){const selected=ordinary.columns.filter(c=>['clear','tokenized','masked'].includes(c.treatment)).map(column=>({object:ordinary,column,alias:column.name,side:'a' as const}));plan={kind:'ordinary identity-independence',objects:[ordinary],selected,sql:`SELECT ${selected.map(c=>quote(c.column.name)).join(',')} FROM ${table(ordinary.name)}`};}}if(sequence===1&&values.custody){const object=discovery.objects.find(o=>o.columns.some(c=>c.treatment==='aggregate_only'&&/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/i.test(c.type)));const column=object?.columns.find(c=>c.treatment==='aggregate_only'&&/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/i.test(c.type));if(object&&column)plan={kind:'ordinary aggregate identity-independence',objects:[object],selected:[],aggregate:column,sql:`SELECT COUNT(${quote(column.name)}) AS n,SUM(${quote(column.name)}) AS total FROM ${table(object.name)}`};}if(spec&&sequence%2===0){const choices=spec.scenarios.filter(s=>s.poolIndex===agent.poolIndex&&s.credential==='normal'&&(!s.credentialId||s.credentialId===agent.credentialId));declared=choices[Math.floor(sequence/2)%choices.length]!;plan=scenarioPlan(declared,spec);}
    sequence++;if(plan.join)joins++;if(plan.kind==='withheld probe')bump('treatments','withheld (refusal probe)');
    const explanation=await agent.client.callTool({name:'opintel.explain',arguments:{sql:plan.sql}});await record({type:'explain',at,agent:agent.agentId,pool,sequence,sql:plan.sql,response:explanation});
    // Refused explain still goes through query so refusal evidence is exercised.
    bump('agents',agent.agentId);bump('pools',pool);
    const started=performance.now();
    const response=await agent.query(plan.sql),elapsed=performance.now()-started;
    const output=QueryOutput.safeParse(response.structuredContent),refused=response.isError===true;
    const outcome=refused?String(response._meta?.code??'refused'):'success';bump('outcomes',outcome);if(refused)bump('refusals',outcome);
    latencies.set(Math.round(elapsed),(latencies.get(Math.round(elapsed))??0)+1);
    const context={agent:agent.agentId,pool,sequence,sql:plan.sql,response};await record({type:'query',at,...context,latencyMs:elapsed,outcome});
    if(declared&&coverage){const valuesMatch=!output.success||!spec||scenarioValuesMatch(declared,spec,output.data.columns,output.data.rows);const actual={outcome:valuesMatch?outcome:'value_mismatch',reason:typeof response._meta?.reason==='string'?response._meta.reason:undefined,rowCount:output.success?output.data.rows.length:undefined};if(!coverage.observe(declared,actual))await alarm('Declared scenario outcome mismatch',{scenario:declared.id,expected:declared.expected,actual});await record({type:'scenario',scenario:declared.id,expected:declared.expected,actual});}
    if(refused&&response.structuredContent!==undefined)await alarm('Refusal delivered structured values',context);
    if(!refused&&!output.success)await alarm('Successful response violates query contract',context);
    if(output.success){
     const out=output.data;
     if(spec){for(const scope of out.rowScopes??[]){const expected=spec.objects.find(o=>o.name===scope.objectName&&o.poolIndex===agent.poolIndex);if(expected&&scope.entitledRows!==expected.expectedRowCount)await alarm('Entitled row count differs from seeder',{object:scope.objectName,expected:expected.expectedRowCount,actual:scope.entitledRows});}
      if(!declared&&!plan.aggregate){let expected:number;if(plan.join){const a=eligible(plan.objects[0]!,agent.poolIndex),b=eligible(plan.objects[1]!,agent.poolIndex);expected=a.reduce((n,r)=>n+b.filter(s=>s[plan!.join!]===r[plan!.join!]).length,0);}else expected=eligible(plan.objects[0]!,agent.poolIndex).filter(r=>!plan!.filter||r[plan!.filter]!==null).length;if(out.rows.length!==expected)await alarm('Exploratory result count differs from seeder',{expected,actual:out.rows.length,...context});}
     }
     const agentCustody=custodyByAgent[agent.agentId]!;if(!out.custody?.length){agentCustody.ordinaryAnswers++;if(exchanges.get(agent.device.certificateId)?.ok===false)agentCustody.ordinaryAnswersWhileExchangeUnavailable++;}const custodyExpected:Record<string,unknown[]>={};if(plan.join)matched+=out.rows.length;
     const allowed=new Set(plan.selected.map(s=>s.alias));if(plan.aggregate){allowed.add('n');allowed.add('total');}
     for(const c of out.columns){if(!allowed.has(c.name))await alarm('Unexpected or withheld result column',{...context,column:c});}
     for(const o of plan.objects)for(const name of o.withheld)if(out.columns.some(c=>c.name===name))await alarm('Withheld column returned',context);
     if(plan.aggregate){const expected=eligible(plan.objects[0]!,agent.poolIndex).map(r=>r[plan!.aggregate!.name]).filter(v=>v!==null&&v!==undefined);if(out.rows.length!==1||Number(out.rows[0]?.[0])!==expected.length||Number(out.rows[0]?.[1])!==expected.reduce<number>((sum,v)=>sum+Number(v),0))await alarm('Aggregate differs from pool fixture',context);bump('treatments',plan.aggregate.treatment);}
     for(const [rowIndex,row] of out.rows.entries()){
      if(plan.aggregate)continue;
      for(const object of plan.objects){
       const selections=plan.selected.filter(s=>s.object===object);
       const candidates=(declared?.expected.rows&&plan.objects.length===1&&!plan.aggregate?declared.expected.rows:eligible(object,agent.poolIndex)).filter(raw=>selections.filter(s=>s.column.treatment==='clear').every(s=>String(raw[s.column.name])===String(row[out.columns.findIndex(c=>c.name===s.alias)])));
       if(!candidates.length){await alarm('Row outside this pool or unrecognised fixture row',{...context,row,object:object.name});continue;}
       for(const s of selections){const index=out.columns.findIndex(c=>c.name===s.alias);if(index<0){await alarm('Selected column absent',{...context,column:s.alias});continue;}const value=row[index],t=s.column.treatment;bump('treatments',t);
        if(t==='clear')continue;
        if(value===null){if(!candidates.some(raw=>raw[s.column.name]===null))await alarm('Unexpected null treatment value',{...context,column:s.alias});continue;}
        if(rowsFor(object).some(raw=>raw[s.column.name]!==null&&raw[s.column.name]!==undefined&&String(raw[s.column.name])===String(value)))await alarm('Non-clear column disclosed a literal',{...context,column:s.alias,value});
        if(t==='aggregate_only')await alarm('Non-listable treatment returned in ordinary rows',{...context,column:s.alias,t});
        if(t==='custody'){
         if(typeof value!=='string'||!value.startsWith('opintelsealed:v1:'))await alarm('Custody column arrived without sealing',{...context,column:s.alias,value});
         if(!out.custody?.some(b=>b.columns.includes(s.alias)))await alarm('Custody column has no grant',{...context,column:s.alias});
         const expected=[...new Set(candidates.map(raw=>raw[s.column.name]))];if(expected.length!==1)await alarm('Custody expectation is ambiguous',{...context,column:s.alias});else (custodyExpected[s.alias]??=[])[rowIndex]=expected[0];
        }
        if(t==='masked'&&!candidates.some(raw=>value===declaredMask(raw[s.column.name])))await alarm('Masked value has wrong shape',{...context,column:s.alias,value});
        if(t==='tokenized'){
         if(typeof value!=='string'||!/^v1_[^_]+_[0-9A-HJKMNP-TV-Z]{26}$/u.test(value))await alarm('Invalid token format',{...context,column:s.alias,value});
         const underlying=[...new Set(candidates.map(raw=>String(raw[s.column.name])))];
         if(underlying.length!==1)await alarm('Cannot independently identify token entity',{...context,column:s.alias});
         else{const key=s.column.name+'/'+underlying[0],previous=tokens.get(key);if(previous!==undefined&&previous!==value)await alarm('Token differs across queries, pools or sources',{...context,column:s.alias,previous,value});tokens.set(key,value);}
        }
       }
      }
     }
     if(declared?.kind==='declared join'&&declared.expected.rows){const expected=declared.expected.rows;const clear=plan.selected.filter(s=>s.column.treatment==='clear');const canonical=(rows:unknown[][])=>rows.map(r=>JSON.stringify(r)).sort();const actualRows=out.rows.map(r=>clear.map(c=>r[out.columns.findIndex(v=>v.name===c.alias)]));const expectedRows=expected.map(r=>clear.map(c=>r[c.alias]));if(JSON.stringify(canonical(actualRows))!==JSON.stringify(canonical(expectedRows)))await alarm('Declared join membership mismatch',{scenario:declared.id,expected:expectedRows,actual:actualRows});}
     if(out.custody?.length){
      agentCustody.offered+=out.custody.length;for(const bundle of out.custody){terminalLog(`${new Date().toISOString()} ${agent.agentId} escrow observed columns=${bundle.columns.join(',')}`);await record({type:'escrow-offered',agent:agent.agentId,sequence,columns:bundle.columns});}
      if(custody){const result=await custody.complete(agent.index,out,custodyExpected);if(result.ok){custodyVerified+=result.verified??0;agentCustody.completed+=out.custody.length;}else if(result.mismatch){await alarm('Successful redemption did not unseal to the fixture value',context);}else{custodyRefused++;terminalLog(`${new Date().toISOString()} ${agent.agentId} custody refused stage=${result.stage} status=${result.status??result.code??'unknown'}`);}await record({type:'custody-result',agent:agent.agentId,sequence,result});}
      else{custodySkipped+=out.custody.length;terminalLog(`${new Date().toISOString()} ${agent.agentId} escrow observed; redemption skipped (--custody not enabled)`);}
     }
    }
    const id=output.success?output.data.evidenceId:typeof response._meta?.evidenceId==='string'?response._meta.evidenceId:undefined;
    if(!id)await alarm('Receipt missing',context);
    else{
     const observed=await receiptRead(id,agent.agentId);
     if(observed===null)await alarm('Stored receipt missing',context);
     else if(observed){const {receipt,detail}=observed;await record({type:'receipt',agent:agent.agentId,sequence,id,detail});
      if(receipt.agent_id!==agent.agentId||receipt.pool_id!==agent.pool||receipt.credential_id!==agent.credentialId)await alarm('Receipt caller interleaving',{...context,receipt});
      if(literals.some(v=>JSON.stringify(detail).includes(JSON.stringify(v))))await alarm('Receipt contains fixture literal',{...context,detail});
     }
    }
    terminalLog(`${at} ${agent.agentId} ${pool} ${plan.kind} ${outcome} rows=${output.success?output.data.rows.length:0} ${elapsed.toFixed(0)}ms ${plan.sql}`);
   }catch(error){if(error instanceof ObserverFailure)halt();errors++;const message=error instanceof Error?error.message:String(error);terminalError(`${at} ${agent.agentId} ${pool} ERROR ${message}`);await record({type:'error',at,agent:agent.agentId,pool,sequence,sql:plan?.sql,message});}
   await pause(rate+Math.floor(rng()*Math.max(1,rate/4)),undefined,{signal:stop.signal}).catch(()=>{});
  }
 }));}finally{if(timer)clearTimeout(timer);}
}catch(error){errors++;terminalError(error instanceof Error?error.message:String(error));await record({type:'fatal',message:error instanceof Error?error.message:String(error)});}
finally{
 await observer?.close();
 const receiptInvariants=observer?.summary()??{enabled:!values.target,failed:Boolean(values.target),reason:values.target?'Observer preflight did not complete':null,checksSkipped:0};
 const passed=!breaches&&!errors&&!receiptInvariants.failed&&receiptInvariants.checksSkipped===0;
 terminalError(`${passed?'SOAK PASSED':'!!! SOAK FAILED'}: receipt checks skipped=${receiptInvariants.checksSkipped}; receipt verification=${receiptInvariants.failed?'FAILED':'active'}${receiptInvariants.reason?'; '+receiptInvariants.reason:''}; invariant breaches=${breaches}; operational errors=${errors}`);
 const sorted=[...latencies].sort((a,b)=>a[0]-b[0]),total=sorted.reduce((n,[,c])=>n+c,0);
 const percentile=(p:number)=>{let n=0;for(const [ms,c] of sorted){n+=c;if(n>=Math.ceil(total*p))return ms;}return null;};
 const summary={type:'summary',status:passed?'PASSED':'FAILED',receiptInvariants,...counters,joinsAttempted:joins,joinRowsMatched:matched,latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)},invariantBreaches:breaches,operationalErrors:errors,custody:{verifiedValues:custodyVerified,refusals:custodyRefused,skipped:custodySkipped,perAgent:Object.fromEntries(Object.entries(custodyByAgent).map(([id,state])=>[id,{...state,exchange:state.certificateId?exchanges.get(state.certificateId)??{ok:false,reason:'not_requested'}:{ok:false,reason:'no_association'}}]))},coverage:coverage?.summary()??{status:'Self-contained V-01; no demo manifest'},log:path};
 if(coverage){const c=coverage.summary();terminalLog(`COVERAGE ${c.exercised}/${c.declared} (${c.percent}%). NOT EXERCISED: ${c.unhit.join(', ')||'none'}`);}
 terminalLog(JSON.stringify(summary,null,2));await record(summary);
 try{await custody?.close();await external?.close();await f?.close();}finally{try{await baseline?.close();}finally{await spice?.close();await writes;await log.close();}}
 process.exit(passed?0:1);
}
