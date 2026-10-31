import type {Page} from '@playwright/test';
import {ActivitySummary} from '../src/shared/api/activity.js';
export const project='00000000-0000-4000-8000-000000000001',pool='00000000-0000-4000-8000-000000000002',object='00000000-0000-4000-8000-000000000003',credential='00000000-0000-4000-8000-000000000004',at='2026-10-30T00:00:00.000Z';
export const projectView={id:project,name:'Review',company:{id:project,name:'Company'},industry:{id:project,name:'Insurance'},region:'eu-west-1',role:'admin',firstReceiptAt:at};
export const poolDetail={id:pool,name:'Reporting pool',sourceIds:[project],modeQuery:true,modePrompt:false,workingKeys:1,agents:1,activeAgents:1,clearElements:1,activeElements:1,graceSeconds:60,keys:[],credentials:[{id:credential,label:'Reader',custodyAlias:'agent:reader',state:'active',lastUse:null}]};
export const company={id:project,name:'Company',defaultIndustryId:project,defaultRegion:'eu-west-1',allowedDomains:[],idleTimeoutMins:60,ssoEnforced:false,enabledProviders:[]};
export const summary=ActivitySummary.parse({counts:{all:0,refused:0,incomplete:0,answerTreated:0},days:[],buckets:[]});
const empty={items:[],nextCursor:null};
/** Transport fixtures only; production and smoke use the real backend. */
export async function mockConsole(page:Page,{welcome=false}:{welcome?:boolean}={}){
 await page.addInitScript(()=>{class Stream{close(){}}Object.defineProperty(window,'EventSource',{value:Stream});});
 await page.route('**/deployment.json',r=>r.fulfill({json:{selfSignedTls:true}}));
 await page.route('**/api/v1/**',r=>{
  const u=new URL(r.request().url()),path=u.pathname,tail=path.split('/').at(-1);
  let value:unknown=empty;
  if(path.endsWith('/auth/providers'))value={magicLink:true,providers:[],enforced:null};
  else if(path.endsWith('/auth/callback'))return r.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Sign-in unavailable. Request a new link.',requestId:'conformance',retryable:true}}});
  else if(path.endsWith('/auth/me'))value={email:'admin@example.test'};
  else if(path==='/api/v1/me/settings')value={email:'admin@example.test',fullName:'Admin',timezone:'UTC',dateFormat:'YYYY-MM-DD',reducedMotion:false};
  else if(path.endsWith('/companies'))value={items:[{id:project,name:'Company',role:'admin',projectCount:1}],nextCursor:null};
  else if(path.endsWith('/industries'))value=[{id:project,name:'Insurance',slug:'insurance',description:null,inheritedTermCount:0,hasDemoPack:false}];
  else if(path.endsWith('/demo-sources'))value=[];
  else if(path.endsWith('/paired-engines'))value={items:[]};
  else if(path.includes('/companies/')&&tail==='settings')value=company;
  else if(path.endsWith('/projects'))value={items:welcome?[]:[projectView],nextCursor:null};
  else if(path.endsWith('/pools'))value={items:[poolDetail],nextCursor:null};
  else if(path.endsWith('/pools/'+pool))value=poolDetail;
  else if(path.endsWith('/tables'))value={items:[{objectId:object,sourceId:project,name:'records',needsRows:true,reason:'rule_required'}],nextCursor:null};
  else if(path.endsWith('/entitlement-members'))value={items:[{id:credential,group:'field',name:'field_1',qualifiedName:'warehouse.public.records.field_1',objectId:object,objectName:'records',objectLabel:'records',sourceId:project,exposedType:'INTEGER',sourceType:'integer',treatment:'clear',maskKind:null,justification:null}],nextCursor:null};
  else if(path.endsWith('/row-entitlements'))value={...empty,projectHasDefault:false,counts:{missing:1,overridden:0,inherited:0,unscoped:0}};
  else if(path.endsWith('/catalog'))value={nodes:[],nextCursor:null};
  else if(path.endsWith('/needs-you'))value={items:Array.from({length:8},(_,i)=>({id:'check:'+i,kind:'check_required',title:'Check engine '+(i+1),count:1,targetRoute:`/projects/${project}/settings-engines`,roles:['admin']})),nextCursor:null};
  else if(path.endsWith('/health'))value={items:[{kind:'engine',status:'warning',checked_at:null,reason:'Not verified',next_action:null},{kind:'tls',status:'warning',checked_at:null,reason:'Self-signed TLS',next_action:null}]};
  else if(path.endsWith('/stats'))value={asOf:at,utcDay:at.slice(0,10),pools:1,sources:0,spectrum:{clear:1,custody:0,tokenized:0,masked:0,aggregate_only:0,withheld:0,undecided:0},requests:0,queries:0,prompts:0,refused:0,incomplete:0,connectedAgents:0,staleAgents:0};
  else if(path.endsWith('/runs/summary'))value=summary;
  else if(path.endsWith('/settings'))value={settings:{query:{rowLimit:100,timeoutSeconds:30,memoryLimitMb:512,concurrencyPerPool:2},discovery:{valueSampling:false,newElements:'hold'},evidence:{fullRetentionDays:30,rollupRetentionDays:365}}};
  else if(path.endsWith('/custody-provider'))value={provider:'local',available:true,reason:'development_only',checkedAt:at,apiKeySet:false,signingKeyId:null,affectedColumns:0};
  else if(path.endsWith('/token-key'))value={currentVersion:1,versions:[{version:1,state:'current',createdAt:at,createdBy:null,reason:null,backupVerifiedAt:at,lastRehearsedAt:at,lastRehearsal:'ok'}]};
  return r.fulfill({json:value});
 });
}
