import {generateSpecification} from '../../demo-soak-definition.js';
import {QueryRefusalMetadata} from '../../../src/shared/api/query-refusal.js';
import {queryOutcomeBreach} from '../../soak/query-breach.js';
import {DescribeOutput,QueryOutput} from '../../../src/shared/api/mcp.js';
import {EvidenceDetail,ActivityPage} from '../../../src/shared/api/activity.js';
import {scenarioValuesMatch,expectedReturnedRows,refusalEvidenceMatches,discoveryMismatches,declaredMask} from '../../soak/scenarios.js';
import {externalTarget} from '../../soak/external.js';
import {logicalId,type Cell} from './registry.js';
import {MissingPrerequisite,type Actual} from './scheduler.js';
import type {PublicApi} from '../../soak/public-setup.js';
import type {custodyAgents} from '../../soak/custody.js';
import type {DemoManifest} from '../../soak/manifest.js';
export async function cellExecutor(input:{base:string;manifestFile:string;call:PublicApi;devices:ReturnType<typeof custodyAgents>;exchanges:Map<number,{ok:boolean}>;fetcher:typeof fetch}){
 const external=await externalTarget(input.base,input.manifestFile,input.fetcher),m:DemoManifest=external.manifest,spec=generateSpecification(Object.fromEntries(Object.entries(m.objects).map(([full,name])=>[name,full])),m.agents);
 if(JSON.stringify(spec)!==JSON.stringify(m.specification)){await external.close();throw new MissingPrerequisite('fixture specification differs from the versioned artifact');}
 const clients=new Map<string,Awaited<ReturnType<typeof external.connect>>>(),tokens=new Map<string,unknown>();let sequence=0;
 async function receipt(id:string,agent:string){let cursor:string|null=null;do{const list=ActivityPage.parse(await input.call(`/api/v1/projects/${m.projectId}/runs?`+new URLSearchParams({agentId:agent,limit:'100',...(cursor?{cursor}:{})})));const row=list.items.find(r=>r.id===id);if(row)return EvidenceDetail.parse(await input.call(`/api/v1/runs/${id}?`+new URLSearchParams({projectId:m.projectId,startedAt:row.startedAt})));cursor=list.nextCursor;}while(cursor);throw new Error('Receipt not found');}
 return {close:()=>external.close(),async run(cell:Cell):Promise<Actual>{
  const s=spec.scenarios.find(s=>logicalId(s,m)===cell.id);if(!s)throw new MissingPrerequisite('scenario binding unavailable');
  const agent=s.credential==='normal'?(s.credentialId?m.agents.find(a=>a.credentialId===s.credentialId):m.agents.find(a=>a.poolIndex===s.poolIndex)):m.lifecycle?.[s.credential];
  if(!agent)throw new MissingPrerequisite('credential unavailable');
  if(s.credential==='retiring'&&(!('graceUntil'in agent)||typeof agent.graceUntil!=='string'||Date.parse(agent.graceUntil)<=Date.now()))throw new MissingPrerequisite('retiring credential window expired');
  if(s.requiresCustody&&(!agent.association||input.exchanges.size!==4||![...input.exchanges.values()].every(v=>v.ok)))throw new MissingPrerequisite('four certificate exchanges and association required');
  const agentId='verify-v01-'+(++sequence);
  if(s.credential==='revoked'){
   const response=await input.fetcher(new URL(`/mcp/v1/p/${m.projectId}`,input.base),{method:'POST',headers:{authorization:'Bearer '+agent.key,'x-opintel-agent-id':agentId,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'verify-v01',version:'1'}}}),signal:AbortSignal.timeout(15000),redirect:'error'});
   const body=await response.json() as {error?:{code?:unknown}};return {outcome:response.status===401?String(body.error?.code):'unexpected_http',checks:{unauthenticated:response.status===401}};
  }
  let client=clients.get(agent.credentialId);if(!client){client=await external.connect(agent.key,agentId);clients.set(agent.credentialId,client);}else{await client.client.close();client=await external.connect(agent.key,agentId);clients.set(agent.credentialId,client);}
  const describe=DescribeOutput.parse((await client.client.callTool({name:'opintel.describe',arguments:{}})).structuredContent);
  const checks:Record<string,boolean>={discovery:discoveryMismatches(spec,s.poolIndex,describe.objects).length===0};
  await client.client.callTool({name:'opintel.explain',arguments:{sql:s.sql}});
  const response=await client.query(s.sql),out=QueryOutput.safeParse(response.structuredContent),refused=response.isError===true;
  const metadata=QueryRefusalMetadata.partial().safeParse(response._meta??{});checks.metadata=metadata.success;
  const actual:Actual={outcome:refused&&typeof response._meta?.code==='string'&&/^[a-z][a-z0-9_]{0,100}$/u.test(response._meta.code)?response._meta.code:refused?'unrecognized_refusal':'success',...(metadata.success&&metadata.data.cause?{cause:metadata.data.cause}:{}),...(metadata.success&&metadata.data.reason?{reason:metadata.data.reason}:{}),...(out.success?{rowCount:out.data.rows.length}:{}),checks};
  checks.escrow=!queryOutcomeBreach(response);
  checks.responseContract=refused?response.structuredContent===undefined:out.success;
  checks.values=!out.success||scenarioValuesMatch(s,spec,out.data.columns,out.data.rows);
  if(out.success){
   checks.truncated=out.data.truncated===false;
   checks.rowScopes=s.objects.every(name=>{const object=spec.objects.find(o=>o.name===name&&o.poolIndex===s.poolIndex)!,scope=out.data.rowScopes?.find(r=>r.objectName===name);return Boolean(scope&&scope.returnedRows===expectedReturnedRows(object,s)&&(name.endsWith('.open_reference')?scope.decisionId!==null&&!scope.missingDecision:object.rowMode==='missing'?scope.missingDecision:scope.decisionId!==null));});
   const expectedCustody:Record<string,unknown[]>={};
   for(const c of s.kind==='declared aggregate'||s.kind==='treatment semantics'?[]:s.columns){const object=spec.objects.find(o=>o.name===c.object&&o.poolIndex===s.poolIndex)!,column=object.columns.find(v=>v.name===c.name)!,index=out.data.columns.findIndex(v=>v.name===c.alias);if(index<0){checks.columns=false;continue;}
    if(column.treatment==='clear')continue;
    for(const [i,row]of out.data.rows.entries()){
     const candidates=(s.expected.rows&&s.objects.length===1?s.expected.rows:object.rows).filter(raw=>s.columns.filter(v=>v.object===c.object&&object.columns.find(w=>w.name===v.name)?.treatment==='clear').every(anchor=>String(raw[anchor.name])===String(row[out.data.columns.findIndex(v=>v.name===anchor.alias)])));
     const value=row[index];if(!candidates.length){checks.poolRows=false;continue;}
     if(value===null){if(!candidates.some(r=>r[c.name]===null))checks.nullTreatment=false;continue;}
     if(object.rows.some(r=>r[c.name]!==null&&r[c.name]!==undefined&&String(r[c.name])===String(value)))checks.nonClearLiteral=false;
     if(column.treatment==='masked'&&!candidates.some(r=>value===declaredMask(r[c.name])))checks.mask=false;
     if(column.treatment==='tokenized'){
      if(typeof value!=='string'||!/^v1_[^_]+_[0-9A-HJKMNP-TV-Z]{26}$/u.test(value))checks.tokenShape=false;
      const underlying=[...new Set(candidates.map(r=>r[c.name]))];if(underlying.length!==1)checks.tokenOracle=false;else{const key=(column.tokenDomain??object.name+'/'+c.name)+'/'+underlying[0],previous=tokens.get(key);if(previous!==undefined&&previous!==value)checks.tokenStability=false;tokens.set(key,value);}
     }
     if(column.treatment==='custody'){if(typeof value!=='string'||!value.startsWith('opintelsealed:v1:')||!out.data.custody?.some(b=>b.columns.includes(c.alias)))checks.sealed=false;const values=[...new Set(candidates.map(r=>r[c.name]))];if(values.length!==1)checks.custodyOracle=false;else(expectedCustody[c.alias]??=[])[i]=values[0];}
    }
   }
   if(s.requiresCustody){
    if(!agent.association)throw new MissingPrerequisite('certificate association missing');
    if(input.exchanges.size!==4||![...input.exchanges.values()].every(v=>v.ok))throw new MissingPrerequisite('four certificate exchanges required');
    await input.devices.connect(sequence,new URL(`/mcp/v1/p/${m.projectId}`,input.base).href,agent.key,agentId,agent.association,agent.association);
    const redemption=await input.devices.complete(sequence,out.data,expectedCustody);checks.custody=redemption.ok&&(redemption.verified??0)>0;checks.custodyNoSkipped=Boolean(out.data.custody?.length);
   }
  }
  const id=out.success?out.data.evidenceId:typeof response._meta?.evidenceId==='string'?response._meta.evidenceId:undefined;
  checks.receipt=Boolean(id);if(id){actual.receiptId=id;const detail=await receipt(id,agentId);if(out.success)checks.receiptScopes=Boolean(out.data.rowScopes?.length)&&out.data.rowScopes!.every(scope=>{const stored=detail.metadata?.rowScopes?.find(v=>v.objectName===scope.objectName);return stored?.decisionId===scope.decisionId&&stored?.hash===scope.hash&&stored?.missingDecision===scope.missingDecision&&stored?.returnedRows===scope.returnedRows;});checks.caller=detail.agentId===agentId&&detail.poolId===agent.pool&&detail.credentialId===agent.credentialId;checks.noLiterals=!spec.literals.some(v=>JSON.stringify(detail).includes(JSON.stringify(v)));if(refused&&s.kind==='treatment semantics')checks.refusalEvidence=refusalEvidenceMatches(s,id,detail);}
  return actual;
 }};
}
