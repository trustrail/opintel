import type { Page } from '@playwright/test';
import { mock as catalogMock,project } from './catalog-fixture.js';
export {project,expand} from './catalog-fixture.js';
export const pool='018f8f9d-7f83-7abc-8def-000000000004';
export const source='018f8f9d-7f83-7abc-8def-000000000002';
export const object='018f8f9d-7f83-7abc-8def-000000000003';
const id=(n:number)=>`018f8f9d-7f83-7abc-8def-${String(n+100).padStart(12,'0')}`;
export async function mock(page:Page){
 await catalogMock(page);
 const state={large:false,empty:false,error:false,loading:false,viewer:false,failBulk:false,invalid:false,requests:[] as {parent:string;limit:number;cursor:string|null}[],commands:[] as {body:Record<string,unknown>;key:string|undefined}[],decisions:new Map<string,string>()};
 await page.route('**/api/v1/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname;
 if(path.endsWith('/projects')&&state.viewer)return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id:object,name:'Example Company'},industry:{id:object,name:'General'},region:'eu-west-1',role:'viewer'}],nextCursor:null}});
 if(path.endsWith('/pools'))return route.fulfill({json:{items:[{id:pool,name:'Reporting pool',sourceIds:[source]},{id:'018f8f9d-7f83-7abc-8def-000000000005',name:'Other pool',sourceIds:[source]}],nextCursor:null}});
 if(path.endsWith('/view-definition'))return route.fulfill({json:{views:[{catalog:'warehouse',schema:'public',name:'records',ddl:'CREATE VIEW "warehouse"."public"."records" AS SELECT "field_0000" AS "field_0000" FROM staged_records;'}],omitted:[]}});
 if(path.endsWith('/entitlements/bulk')){
 const body=route.request().postDataJSON() as Record<string,unknown>;state.commands.push({body,key:route.request().headers()['idempotency-key']});
 if(state.failBulk)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Decisions could not be saved. Try again.',requestId:'bulk-test',retryable:true}}});
 if(state.invalid)return route.fulfill({status:422,json:{error:{code:'validation_failed',message:'No decisions changed.',requestId:'bulk-test',retryable:false,details:{invalidElements:[{elementId:id(0),reasons:['A token domain is missing.']}]}}}});
 for(const element of body.elementIds as string[])state.decisions.set(element,body.treatment as string);
 return route.fulfill({json:{decisionId:object,poolId:pool,treatment:body.treatment,count:(body.elementIds as string[]).length,decidedAt:'2026-01-01T00:00:00.000Z'}});
 }
 if(!path.endsWith('/entitlements'))return route.fallback();
 const parent=url.searchParams.get('parent')??'',prefix=url.searchParams.get('prefix')??'',limit=Number(url.searchParams.get('limit')??50),cursor=url.searchParams.get('cursor');state.requests.push({parent,limit,cursor});
 if(state.loading)await new Promise(resolve=>setTimeout(resolve,1000));
 if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Decisions are temporarily unavailable. Try again.',requestId:'read-test',retryable:true}}});
 const base={treatment:null,maskKind:null,justification:null,exposedType:null,childCount:1};let nodes:unknown[]=[];let nextCursor:string|null=null;
 if(!state.empty){if(!parent)nodes=[{...base,id:source,label:'warehouse',kind:'source'}];else if(parent===source)nodes=[{...base,id:source+':public',label:'public',kind:'schema'}];else if(parent===source+':public')nodes=[{...base,id:object,label:'records',kind:'object',childCount:state.large?5000:7}];else{
 const defaults=[null,'clear','tokenized','masked','aggregate_only','withheld',null];
 const all=Array.from({length:state.large?5000:7},(_,n)=>({...base,id:id(n),label:`field_${String(n).padStart(4,'0')}`,kind:'element',childCount:null,exposedType:n===6&&!state.large?null:'VARCHAR',treatment:state.decisions.get(id(n))??(state.large?null:defaults[n]),maskKind:n===3&&!state.large?'all':null})).filter(n=>(!prefix||n.label.startsWith(prefix))&&(url.searchParams.get('undecided')!=='true'||n.treatment===null));
 const start=Number(cursor??0);nodes=all.slice(start,start+limit);nextCursor=start+limit<all.length?String(start+limit):null;
 }}return route.fulfill({json:{nodes,nextCursor}});
 });return state;
}
