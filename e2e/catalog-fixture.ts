import type { Page } from '@playwright/test';
export const project='018f8f9d-7f83-7abc-8def-000000000001';
const source='018f8f9d-7f83-7abc-8def-000000000002';
const object='018f8f9d-7f83-7abc-8def-000000000003';
const schema=source+':public';
export async function mock(page:Page){
 const state={empty:false,error:false,loading:false,large:false,requests:[] as {parent:string;prefix:string;cursor:string|null}[]};
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id:object,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id:object,name:'Example Company'},industry:{id:object,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
  if(path.endsWith('/sources'))return route.fulfill({json:{items:[{id:source,name:'Renamed Warehouse',exposedAlias:'warehouse',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:null,filingCount:null,elementCount:5000,undecidedCount:5000,latestIntrospectionId:null,lastIntrospectedAt:null}],nextCursor:null}});
  if(path.endsWith('/catalog')){
   const parent=url.searchParams.get('parent')??'';const prefix=url.searchParams.get('prefix')??'';const cursor=url.searchParams.get('cursor');state.requests.push({parent,prefix,cursor});
   if(state.loading)await new Promise(resolve=>setTimeout(resolve,1000));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'The catalogue is temporarily unavailable. Try again.',requestId:'catalog-test',retryable:true}}});
   const base={childCount:1,exposedType:null,state:null};
   let nodes:unknown[];let nextCursor:string|null=null;
   if(state.empty)nodes=[];
   else if(!parent)nodes=prefix&&!('warehouse'.startsWith(prefix))?[]:[{...base,id:source,kind:'source',label:'warehouse'}];
   else if(parent===source)nodes=[{...base,id:schema,kind:'schema',label:'public'}];
   else if(parent===schema)nodes=[{...base,id:object,kind:'object',label:'records',childCount:state.large?5000:4}];
   else if(state.large){
    // Each request is still one bounded page. The test drives every page explicitly.
    const start=Number(cursor??0);const count=50;
    nodes=Array.from({length:Math.min(count,5000-start)},(_,i)=>({id:`element-${start+i}`,kind:'element',label:`field_${String(start+i).padStart(4,'0')}`,childCount:null,exposedType:'VARCHAR',state:'undecided'}));
    nextCursor=start+count<5000?String(start+count):null;
   }else nodes=[{id:'number',label:'record_id',exposedType:'INTEGER',state:'undecided'},{id:'text',label:'record_name',exposedType:'VARCHAR',state:'undecided'},{id:'unsupported',label:'location',exposedType:null,state:'unsupported'},{id:'unnameable',label:null,exposedType:null,state:'unnameable'}].filter(n=>!prefix||n.label?.startsWith(prefix)).map(n=>({...n,kind:'element',childCount:null}));
   return route.fulfill({json:{nodes,nextCursor}});
  }
  return route.fulfill({status:404,json:{}});
 });return state;
}
export async function expand(page:Page){for(const name of ['warehouse','public','records'])await page.getByRole('button',{name:`Expand ${name}`,exact:true}).click();}
