import {URL} from 'node:url';
const {fetch,AbortSignal}=globalThis;
import {readFileSync,writeFileSync} from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import {setTimeout} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// Exercise the real image through the official SDK; never print result values.
const base=new URL(process.argv[2]??'http://127.0.0.1:18080');
if(!['127.0.0.1','localhost'].includes(base.hostname))throw new Error('Use the loopback companion container endpoint.');
const client=new Client({name:'opintel-companion-live-check',version:'1'});
let step='health',status='failed',selected=6;const checks=[];
const requireThat=(value)=>{if(!value)throw new Error('check failed');};
try{
 let ready=false;for(let attempt=0;attempt<60;attempt++){try{ready=(await fetch(new URL('/healthz',base),{signal:AbortSignal.timeout(1000)})).ok;}catch{/* Startup may still be exchanging the identity. */}if(ready)break;await setTimeout(1000);}requireThat(ready);
 step='initialize';await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',base)));
 step='tools/list';const {tools}=await client.listTools();requireThat(JSON.stringify(tools.map(t=>t.name).sort())===JSON.stringify(['opintel_describe','opintel_query','opintel_unseal']));console.info('tools/list: opintel_describe, opintel_query, opintel_unseal');
 step='opintel_describe';const described=await client.callTool({name:step,arguments:{}});requireThat(!described.isError&&!described.structuredContent?.refused);requireThat(Array.isArray(described.structuredContent?.sqlRules)&&described.structuredContent.sqlRules.length===4);const custody=described.structuredContent?.custody;requireThat(!custody||(!Object.hasOwn(custody,'tenant')&&!Object.hasOwn(custody,'keys')));console.info('opintel_describe: ok');
 const cases=process.argv[3]?JSON.parse(readFileSync(process.argv[3],'utf8')):[
  {name:'rows',sql:'SELECT claim_id, claim_amount FROM testing_reinsurance.soak_claims.claims',column:'claim_amount',rows:12},
  {name:'aggregate',lookup:'both',sql:'SELECT cedant, SUM(claim_amount) AS total FROM testing_reinsurance.soak_claims.claims GROUP BY cedant',column:'total',rows:3},
 ];
 selected=cases.length*3;
 for(const scenario of cases){
  step=scenario.name+' query';const reply=await client.callTool({name:'opintel_query',arguments:{sql:scenario.sql}}),query=reply.structuredContent;
  if(query?.refused)console.info(`${scenario.name} query: refused code=${query.code}`);
  requireThat(!reply.isError&&query&&!query.refused&&Array.isArray(query.rows)&&query.rows.length===scenario.rows&&Array.isArray(query.columns));
  const index=query.columns.findIndex(c=>c.name===scenario.column);requireThat(index>=0&&query.rows.every(row=>typeof row[index]==='string'&&row[index].startsWith('opintelsealed:')));requireThat(typeof query.evidenceId==='string'&&/^[a-f0-9-]{36}$/u.test(query.evidenceId));console.info(`${scenario.name} opintel_query: rows=${scenario.rows} evidenceId=${query.evidenceId}`);checks.push({name:scenario.name+' query',evidenceId:query.evidenceId,rows:scenario.rows});
  step=scenario.name+' unseal';const lookup={evidenceId:query.evidenceId,...(scenario.lookup==='both'?{grantId:query.grants[0].grantId}:{})};const clear=await client.callTool({name:'opintel_unseal',arguments:lookup}),unsealed=clear.structuredContent;
  if(unsealed?.refused)console.info(`${scenario.name} unseal: refused code=${unsealed.code}`);
  requireThat(!clear.isError&&unsealed&&!unsealed.refused&&Array.isArray(unsealed.rows)&&unsealed.rows.length===scenario.rows&&unsealed.rows.every(row=>row[index]!==null&&row[index]!==undefined&&!String(row[index]).startsWith('opintelsealed:')));console.info(`${scenario.name} opintel_unseal: rows=${scenario.rows} evidenceId=${query.evidenceId}`);checks.push({name:scenario.name+' unseal',evidenceId:query.evidenceId,rows:scenario.rows});
  step=scenario.name+' replay';const repeated=await client.callTool({name:'opintel_unseal',arguments:{evidenceId:query.evidenceId}}),refusal=repeated.structuredContent;requireThat(refusal?.refused===true&&refusal.code==='forbidden');console.info(`${scenario.name} replay: refused code=forbidden`);checks.push({name:scenario.name+' replay',code:'forbidden'});
 }
 status='passed';
}catch{console.error(`Live companion check failed at ${step}; no values were logged.`);process.exitCode=1;}finally{if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify({status,checks,passed:checks.length,failed:status==='passed'?0:1,notExercised:Math.max(0,selected-checks.length-(status==='passed'?0:1)),...(status==='passed'?{}:{failure:{step}})})+'\n',{mode:0o600});await client.close().catch(()=>{});}
