import type {Page} from '@playwright/test';
import type {PoolDetail,AgentTwin} from '../src/shared/api/pools.js';
export const project='018f8f9d-7f83-7abc-8def-000000000001',pool='018f8f9d-7f83-7abc-8def-000000000002',version='018f8f9d-7f83-7abc-8def-000000000003',nextVersion='018f8f9d-7f83-7abc-8def-000000000004';
export const credential='opk_live_1234567890123456789012';
const key={poolId:pool,keyVersion:version,prefix:'opk_live_12345678',createdAt:'2026-09-01T12:00:00.000Z',state:'current' as const,graceUntil:null};
export const detail:PoolDetail={id:pool,name:'Reporting pool',sourceIds:[],modeQuery:true,modePrompt:true,workingKeys:1,agents:2,activeAgents:1,clearElements:3,activeElements:99,keys:[key],graceSeconds:86400};
export const twin:AgentTwin={keyMetadata:key,presence:{poolId:pool,agentId:'reporter',client:'Reporting client',verified:false,keyVersion:version,firstSeen:'2026-09-01T12:00:00.000Z',lastSeen:'2026-09-20T12:00:00.000Z',lastRequestAt:'2026-09-20T12:00:00.000Z',lastHeartbeatAt:'2026-09-20T12:00:00.000Z',staleAt:'2026-09-20T12:01:00.000Z',reconnects:2,state:'disconnected'}};
export const poolsPath=`/projects/${project}/pools`,poolPath=`${poolsPath}/${pool}`,twinPath=`${poolPath}/agents/reporter`;
export async function mockPools(page:Page){
 const state={detail:structuredClone(detail),twin:structuredClone(twin),empty:false,error:false,missing:false,loading:false,replay:false,posts:[] as {path:string;body:unknown}[],reads:[] as string[]};
 await page.addInitScript(()=>{
  class Stream {onmessage:((e:{data:string})=>void)|null=null;constructor(){Object.defineProperty(window,'poolStream',{value:this,configurable:true});}close(){}}
  Object.defineProperty(window,'EventSource',{value:Stream});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true});
 });
 await page.route('**/api/v1/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
 if(path.endsWith('/auth/me'))return route.fulfill({json:{id:version,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
 if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id:version,name:'Example Company'},industry:{id:version,name:'Reinsurance'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
 if(method==='POST'){
  state.posts.push({path,body:route.request().postDataJSON() as unknown});
  if(path.endsWith('/revoke')){state.detail.keys[0]={...key,state:'revoked'};state.detail.workingKeys=0;state.twin.keyMetadata={...key,state:'revoked'};return route.fulfill({json:{...key,state:'revoked',keyShown:false,affectedAgentCount:1,affectedAgents:['worker'],previouslySeenAgents:['reporter']}});}
  if(path.endsWith('/rotate')){state.detail.keys=[{...key,keyVersion:nextVersion},{...key,state:'retiring',graceUntil:'2026-09-30T12:00:00.000Z'}];state.detail.workingKeys=2;}
  state.empty=false;
  return route.fulfill({json:{...key,keyVersion:nextVersion,keyShown:!state.replay,...(!state.replay?{key:credential}:{})}});
 }
 state.reads.push(path);if(state.loading)await new Promise(r=>setTimeout(r,800));
 if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Pools are temporarily unavailable.',requestId:'test',retryable:true}}});
 if(state.missing)return route.fulfill({status:404,json:{error:{code:'not_found',message:'This pool or agent was not found.',requestId:'test',retryable:false}}});
 if(path.endsWith('/affected-agents'))return route.fulfill({json:{...key,affectedAgentCount:1,affectedAgents:['worker'],previouslySeenAgents:['reporter']}});
 if(path.endsWith('/pools'))return route.fulfill({json:{items:state.empty?[]:[state.detail],nextCursor:null}});
 if(path.endsWith('/agents'))return route.fulfill({json:{items:state.empty?[]:[state.twin.presence,{...state.twin.presence,agentId:'worker',state:'active'}],nextCursor:null}});
 if(path.includes('/agents/'))return route.fulfill({json:state.twin});
 if(path.endsWith('/'+pool))return route.fulfill({json:state.detail});
 return route.fulfill({status:404,json:{}});
 });return state;
}
