import type {Page} from '@playwright/test';
import {ActivityEntry,type EvidenceDetail} from '../src/shared/api/activity.js';
export const project='018f8f9d-7f83-7abc-8def-000000000001',pool='018f8f9d-7f83-7abc-8def-000000000002',id='018f8f9d-7f83-7abc-8def-000000000003';
export const entry:ActivityEntry=ActivityEntry.parse({id,projectId:project,poolId:pool,agentId:'reporting-agent',keyPrefix:'opk_example',mode:'query',startedAt:'2026-09-01T12:00:00.123456Z',status:'answered',rowCount:38,latencyMs:96,synthetic:false,request:'SELECT treaty_ref, premium FROM warehouse.public.treaties WHERE region = \'[redacted]\'',argumentVisibility:'literal_stripped',metadata:{objects:[{catalog:'warehouse',schema:'public',name:'treaties'}],delivered:{tokenized:1,aggregate_only:1},omissions:{},refusal:null},versions:{policy:41,catalog:17,vocabulary:9,tokenKeyVersionSelected:3}});
export const record:EvidenceDetail={...entry,tokenDeclarations:null,objects:[{catalog:'warehouse',schema:'public',name:'treaties',columns:[{elementId:id,exposedName:'treaty_ref'}]}],completedAt:'2026-09-01T12:00:01Z',tokenKeyVersionUsed:3,truncated:false,refusalCode:null,generatedSql:null,elements:[{elementId:id,exposedName:'treaty_ref',state:'released',treatment:'tokenized',withheldReason:null},{elementId:id,exposedName:'premium',state:'aggregated',treatment:'aggregate_only',withheldReason:null}],stages:[{stage:'execute',result:'ok',ms:96,code:null}],sources:[{id,origin:'customer',freshnessMode:'live',landingStrategy:'append_as_at',lastIntrospectedAt:'2026-09-01T10:00:00Z'}]};
export async function mockActivity(page:Page){
 const state={entry:structuredClone(entry),empty:false,error:false,missing:false,loading:false,record:structuredClone(record),total:1000000,rows:null as ActivityEntry[]|null,pools:[{id:pool,name:'Reporting pool',sourceIds:[]}],detailRequests:[] as string[],requests:[] as string[]};
 await page.addInitScript(()=>{class Stream{close(){}}Object.defineProperty(window,'EventSource',{value:Stream});});
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id,name:'Example Company'},industry:{id,name:'Reinsurance'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
  if(path.endsWith('/pools'))return route.fulfill({json:{items:state.pools,nextCursor:null}});
  if(path.endsWith('/runs/summary')){
   const rows=state.rows??[state.entry],multiplier=state.rows?1:state.total;
   const counts={all:0,refused:0,incomplete:0,answerTreated:0};const days=new Map<string,{day:string;counts:typeof counts;outcomes:Record<string,number>}>();
   const treated=(r:ActivityEntry)=>(r.status==='answered'||r.status==='reduced')&&['tokenized','masked','aggregate_only'].some(t=>(r.metadata.delivered[t]??0)>0);
   for(const r of state.empty?[]:rows){counts.all+=multiplier;if(r.status==='refused')counts.refused+=multiplier;if(r.status==='incomplete')counts.incomplete+=multiplier;if(treated(r))counts.answerTreated+=multiplier;
    if(url.searchParams.has('outcome')&&url.searchParams.get('outcome')!==r.status||url.searchParams.has('answerTreated')&&!treated(r))continue;
    const key=r.startedAt.slice(0,10),day=days.get(key)??{day:key,counts:{all:0,refused:0,incomplete:0,answerTreated:0},outcomes:{answered:0,reduced:0,incomplete:0,refused:0,failed:0,clarify:0}};
    day.counts.all+=multiplier;if(r.status==='refused')day.counts.refused+=multiplier;if(r.status==='incomplete')day.counts.incomplete+=multiplier;if(treated(r))day.counts.answerTreated+=multiplier;day.outcomes[r.status]=(day.outcomes[r.status]??0)+multiplier;days.set(key,day);
   }
   return route.fulfill({json:{counts,days:[...days.values()]}});
  }
  if(path.includes('/runs')){
   state.requests.push(url.search);if(state.loading)await new Promise(r=>setTimeout(r,700));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Evidence is temporarily unavailable.',requestId:'test',retryable:true}}});
   if(path.endsWith('/runs')){const start=Number(url.searchParams.get('cursor')??0);const filtered=state.rows?.filter(r=>(!url.searchParams.has('outcome')||r.status===url.searchParams.get('outcome'))&&(!url.searchParams.has('answerTreated')||(r.status==='answered'||r.status==='reduced')&&['tokenized','masked','aggregate_only'].some(t=>(r.metadata.delivered[t]??0)>0)));
    const total=filtered?.length??state.total,count=state.empty?0:Math.min(50,total-start);return route.fulfill({json:{items:filtered?filtered.slice(start,start+count):Array.from({length:count},(_,i)=>({...state.entry,id:`018f8f9d-7f83-7abc-8def-${String(start+i+3).padStart(12,'0')}`})),nextCursor:count&&start+count<total?String(start+count):null}});}
   state.detailRequests.push(path);
   if(state.missing)return route.fulfill({status:404,json:{error:{code:'not_found',message:'This run was not found in this project.',requestId:'test',retryable:false}}});
   return route.fulfill({json:{...state.record,id:path.split('/').at(-1)}});
  }return route.fulfill({status:404,json:{}});
 });return state;
}
export const activityPath=`/projects/${project}/activity`;
export const detailPath=`/projects/${project}/runs/${id}?startedAt=${encodeURIComponent(entry.startedAt)}`;
