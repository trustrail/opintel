import process from 'node:process';
import console from 'node:console';
import {setTimeout} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// Exercise the real image through the official SDK; never print result values.
const base=new URL(process.argv[2]??'http://127.0.0.1:18080');
if(!['127.0.0.1','localhost'].includes(base.hostname))throw new Error('Use the loopback companion container endpoint.');
const client=new Client({name:'opintel-companion-live-check',version:'1'});
let step='health';
const requireThat=(value)=>{if(!value)throw new Error('check failed');};
try{
 let ready=false;for(let attempt=0;attempt<60;attempt++){try{ready=(await fetch(new URL('/healthz',base),{signal:AbortSignal.timeout(1000)})).ok;}catch{/* Startup may still be exchanging the identity. */}if(ready)break;await setTimeout(1000);}requireThat(ready);
 step='initialize';await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',base)));
 step='tools/list';const {tools}=await client.listTools();requireThat(JSON.stringify(tools.map(t=>t.name).sort())===JSON.stringify(['opintel_describe','opintel_query','opintel_unseal']));console.info('tools/list: opintel_describe, opintel_query, opintel_unseal');
 step='opintel_describe';const described=await client.callTool({name:step,arguments:{}});requireThat(!described.isError&&!described.structuredContent?.refused);console.info('opintel_describe: ok');
 step='opintel_query';const reply=await client.callTool({name:step,arguments:{sql:'SELECT * FROM testing_reinsurance.soak_claims.claims'}}),query=reply.structuredContent;requireThat(!reply.isError&&query&&!query.refused&&Array.isArray(query.rows)&&query.rows.length===12&&Array.isArray(query.columns));
 const index=query.columns.findIndex(c=>c.name==='claim_amount');requireThat(index>=0&&query.rows.every(row=>typeof row[index]==='string'&&row[index].startsWith('opintelsealed:')));requireThat(typeof query.evidenceId==='string'&&/^[a-f0-9-]{36}$/u.test(query.evidenceId));console.info(`opintel_query: rows=12 evidenceId=${query.evidenceId}`);
 step='opintel_unseal';const clear=await client.callTool({name:step,arguments:{evidenceId:query.evidenceId}}),unsealed=clear.structuredContent;requireThat(!clear.isError&&unsealed&&!unsealed.refused&&Array.isArray(unsealed.rows)&&unsealed.rows.length===12&&unsealed.rows.every(row=>row[index]!==null&&row[index]!==undefined&&!String(row[index]).startsWith('opintelsealed:')));console.info(`opintel_unseal: rows=12 evidenceId=${query.evidenceId}`);
 step='opintel_unseal repeated';const repeated=await client.callTool({name:'opintel_unseal',arguments:{evidenceId:query.evidenceId}}),refusal=repeated.structuredContent;requireThat(refusal?.refused===true&&refusal.code==='forbidden');console.info('opintel_unseal repeated: refused code=forbidden');
}catch{console.error(`Live companion check failed at ${step}; no values were logged.`);process.exitCode=1;}finally{await client.close().catch(()=>{});}
