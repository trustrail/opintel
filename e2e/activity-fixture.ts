import type {Page} from '@playwright/test';
import type {ActivityEntry,EvidenceDetail} from '../src/shared/api/activity.js';
export const project='018f8f9d-7f83-7abc-8def-000000000001',pool='018f8f9d-7f83-7abc-8def-000000000002',id='018f8f9d-7f83-7abc-8def-000000000003';
export const entry:ActivityEntry={id,projectId:project,poolId:pool,agentId:'reporting-agent',keyPrefix:'opk_example',mode:'query',startedAt:'2026-09-01T12:00:00.123456Z',status:'reduced',rowCount:38,latencyMs:96,synthetic:false,request:'SELECT treaty_ref, premium FROM warehouse.public.treaties WHERE region = \'[redacted]\'',argumentVisibility:'literal_stripped',versions:{policy:41,catalog:17,vocabulary:9,tokenKeyVersionSelected:3}};
export const record:EvidenceDetail={...entry,objects:[],completedAt:'2026-09-01T12:00:01Z',tokenKeyVersionUsed:3,truncated:false,refusalCode:null,generatedSql:null,elements:[{elementId:id,exposedName:'treaty_ref',state:'released',treatment:'tokenized',withheldReason:null},{elementId:id,exposedName:'premium',state:'aggregated',treatment:'aggregate_only',withheldReason:null},{elementId:null,exposedName:'private_note',state:'withheld',treatment:null,withheldReason:'Explicit withholding decision'},{elementId:null,exposedName:'undecided_field',state:'undecided',treatment:null,withheldReason:'No decision recorded'}],stages:[{stage:'execute',result:'ok',ms:96,code:null}],sources:[{id,origin:'customer',freshnessMode:'live',landingStrategy:'append_as_at',lastIntrospectedAt:'2026-09-01T10:00:00Z'}]};
export async function mockActivity(page:Page){
 const state={empty:false,error:false,missing:false,loading:false,record:structuredClone(record),total:1000000,requests:[] as string[]};
 await page.addInitScript(()=>{class Stream{close(){}}Object.defineProperty(window,'EventSource',{value:Stream});});
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id,name:'Example Company'},industry:{id,name:'Reinsurance'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
  if(path.endsWith('/pools'))return route.fulfill({json:{items:[{id:pool,name:'Reporting pool',sourceIds:[]}],nextCursor:null}});
  if(path.includes('/runs')){
   state.requests.push(url.search);if(state.loading)await new Promise(r=>setTimeout(r,700));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Evidence is temporarily unavailable.',requestId:'test',retryable:true}}});
   if(path.endsWith('/runs')){const start=Number(url.searchParams.get('cursor')??0),count=state.empty?0:Math.min(50,state.total-start);return route.fulfill({json:{items:Array.from({length:count},(_,i)=>({...entry,id:`018f8f9d-7f83-7abc-8def-${String(start+i+3).padStart(12,'0')}`})),nextCursor:count&&start+count<state.total?String(start+count):null}});}
   if(state.missing)return route.fulfill({status:404,json:{error:{code:'not_found',message:'This run was not found in this project.',requestId:'test',retryable:false}}});
   return route.fulfill({json:state.record});
  }return route.fulfill({status:404,json:{}});
 });return state;
}
export const activityPath=`/projects/${project}/activity`;
export const detailPath=`/projects/${project}/runs/${id}?startedAt=${encodeURIComponent(entry.startedAt)}`;
