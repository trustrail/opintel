import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout} from 'node:timers/promises';
import {URL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {Headers,Response}=globalThis;

/** Customer workflow only: transport is the same authenticated public HTTPS API
 * as the console. The caller supplies an existing demo database reference, not
 * catalogue rows, a seeded project, or privileged application services. */
export async function firstHour({request,base,engine,source,settings,certificateAssociation,onProgress=()=>{}}){
 const result={status:'running',startedAt:new Date().toISOString(),steps:[]};
 let step='create-empty-project',client;
 const advance=name=>{step=name;onProgress({...result,step});};
 async function api(path,method='GET',body){
  const response=await request(path,method,body,{'idempotency-key':randomUUID()});
  assert.ok(response.status>=200&&response.status<300,`${step}: ${method} ${path} returned HTTP ${response.status}`);
  return response.text?JSON.parse(response.text):undefined;
 }
 async function all(path){const items=[];let cursor;do{const page=await api(path+(path.includes('?')?'&':'?')+'limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));items.push(...page.items);cursor=page.nextCursor;}while(cursor);return items;}
 async function run(name,work){advance(name);const value=await work();result.steps.push({step:name,status:'passed',at:new Date().toISOString()});onProgress({...result,step});return value;}
 try{
  const companies=await all('/api/v1/companies'),company=companies.find(c=>c.role==='admin');assert.ok(company,'No administered company available');
  const industries=await api('/api/v1/industries'),industry=industries.find(i=>i.hasDemoPack);assert.ok(industry,'No demo industry available');
  const project=await run('create-empty-project',()=>api('/api/v1/projects','POST',{companyId:company.id,name:'First hour '+randomUUID().slice(0,8),industryId:industry.id,region:'us-east-1'}));
  const p=project.id;result.projectId=p;
  await run('verify-empty-project',async()=>{assert.equal((await all(`/api/v1/projects/${p}/pools`)).length,0);assert.equal((await all(`/api/v1/projects/${p}/sources`)).length,0);});
  const pool=await run('create-pool',()=>api(`/api/v1/projects/${p}/pools`,'POST',{name:'First hour pool'}));
  await run('register-engine',()=>api(`/api/v1/projects/${p}/engines`,'POST',engine));
  const registered=(await all(`/api/v1/projects/${p}/engines`)).find(e=>e.address===engine.address);assert.ok(registered,'Engine registration was not listed');
  await run('verify-engine',()=>api(`/api/v1/projects/${p}/engines/${registered.id}/verify`,'POST',{}));
  await run('designate-custody-engine',()=>api(`/api/v1/projects/${p}/engines/${registered.id}/custody`,'POST',{}));
  await run('configure-project',()=>api(`/api/v1/projects/${p}/settings`,'PATCH',settings));
  const connected=await run('connect-demo-database',()=>api(`/api/v1/projects/${p}/sources`,'POST',{...source,engineId:registered.id}));
  result.sourceId=connected.id;result.poolId=pool.poolId;
  await run('bind-source',()=>api(`/api/v1/pools/${pool.poolId}/sources/${connected.id}`,'PUT',{projectId:p}));
  await run('source-connected',async()=>{const until=Date.now()+120000;while(Date.now()<until){const current=(await all(`/api/v1/projects/${p}/sources`)).find(s=>s.id===connected.id);assert.ok(current);if(current.status==='connected')return;if(current.status==='introspection_failed')throw new Error('Source introspection failed');await setTimeout(500);}throw new Error('Source connection deadline exceeded');});
  const members=await run('catalogue-six-supported-fields',async()=>{const fields=(await all(`/api/v1/pools/${pool.poolId}/entitlement-members?projectId=${p}&decision=undecided&mode=name&sourceId=${connected.id}`)).filter(e=>e.exposedType);assert.ok(fields.length>=6,'Demo database must expose at least six supported fields');return fields;});
  await run('declare-contributor-key',async()=>{const field=members[0],path=`/api/v1/projects/${p}/catalog/elements/${field.id}/declarations`,declarations=await api(path);await api(path,'PUT',{...declarations.stored,contributorKey:true});});
  await run('check-custody-provider',async()=>{const check=await api(`/api/v1/projects/${p}/custody-provider/check`,'POST',{});assert.ok(check.reachable&&check.authenticated,'Custody provider check failed');});
  for(const [index,treatment] of ['clear','tokenized','masked','aggregate_only','custody','withheld'].entries()){
   const field=members[index];
   if(treatment==='tokenized')await run('declare-token-column',async()=>{const path=`/api/v1/projects/${p}/catalog/elements/${field.id}/declarations`,d=await api(path);await api(path,'PUT',{...d.stored,caseInsensitive:false,canonId:d.effective.canonId});});
   await run('entitlement-'+treatment,()=>api(`/api/v1/pools/${pool.poolId}/entitlements/bulk`,'POST',{projectId:p,elementIds:[field.id],treatment,maskKind:treatment==='masked'?'all':null,justification:'First-hour acceptance explicit decision'}));
  }
  const credential=await run('issue-credential',()=>api(`/api/v1/pools/${pool.poolId}/credentials`,'POST',{projectId:p,label:'First hour caller',...(certificateAssociation?{certificateAssociation}:{})}));assert.ok(credential.keyShown,'New credential was not returned');
  advance('mcp-query');
  client=new Client({name:'first-hour-acceptance',version:'1'});
  const transport=new StreamableHTTPClientTransport(new URL(`/mcp/v1/p/${p}`,base),{requestInit:{headers:{authorization:'Bearer '+credential.key,'x-opintel-agent-id':'first-hour'}},fetch:async(url,init)=>{
   const response=await request(new URL(url).pathname,init?.method??'GET',init?.body?JSON.parse(init.body):undefined,Object.fromEntries(new Headers(init?.headers)));
   return new Response(response.text||null,{status:response.status,headers:response.headers});
  }});
  await client.connect(transport);
  const describe=(await client.callTool({name:'opintel.describe',arguments:{}})).structuredContent;
  const object=describe.objects.find(o=>o.columns.some(c=>c.treatment==='clear'));assert.ok(object,'Clear field is absent from MCP describe');
  const quote=value=>'"'+value.replaceAll('"','""')+'"',column=object.columns.find(c=>c.treatment==='clear');
  const query=await run('mcp-query',()=>client.callTool({name:'opintel.query',arguments:{sql:`SELECT ${quote(column.name)} FROM ${object.name.split('.').map(quote).join('.')} LIMIT 1`}}));assert.ok(!query.isError,'First-hour query was refused');
  const evidenceId=query.structuredContent?.evidenceId;assert.ok(evidenceId,'MCP query returned no receipt');
  await run('fetch-receipt',async()=>{const runs=await all(`/api/v1/projects/${p}/runs`),run=runs.find(r=>r.id===evidenceId);assert.ok(run,'Receipt is absent from Activity');const receipt=await api(`/api/v1/runs/${evidenceId}?projectId=${p}&startedAt=${encodeURIComponent(run.startedAt)}`);assert.equal(receipt.id,evidenceId);assert.ok(receipt.completedAt);result.receiptId=evidenceId;});
  result.status='passed';
 }catch(error){result.status='failed';result.failure={step,message:error instanceof Error?error.message:'First-hour acceptance failed'};}
 finally{await client?.close();result.finishedAt=new Date().toISOString();onProgress(result);}
 return result;
}
