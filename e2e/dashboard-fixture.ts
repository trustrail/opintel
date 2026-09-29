import type {Page} from '@playwright/test';
import type {DashboardStats,DashboardFinding,PoolShield} from '../src/shared/api/dashboard.js';
export const project='018f8f9d-7f83-7abc-8def-000000000001',pool='018f8f9d-7f83-7abc-8def-000000000002',source='018f8f9d-7f83-7abc-8def-000000000003',filing='018f8f9d-7f83-7abc-8def-000000000004';
export const spectrum={clear:80,tokenized:5,masked:4,aggregate_only:3,withheld:6,undecided:2};
export const dashboard:DashboardStats={asOf:'2026-09-29T00:30:00.000Z',utcDay:'2026-09-29',pools:2,sources:1,spectrum,requests:12,queries:10,prompts:2,refused:1,incomplete:1,connectedAgents:3,staleAgents:0};
export const shield:PoolShield={id:pool,name:'Reporting pool',agents:3,spectrum,sources:[{id:source,name:'Warehouse',spectrum}]};
export const quarantine:DashboardFinding={id:'quarantine:'+filing,kind:'quarantine',filingId:filing,zoneId:source,category:'verification_mismatch',receivedAt:'2026-09-28T20:30:00Z'};
export const dashboardPath=`/projects/${project}/dashboard`;
export async function mockDashboard(page:Page){
 const state={stats:structuredClone(dashboard),shields:[structuredClone(shield)],findings:[{id:'undecided:'+pool+':'+source,kind:'undecided' as const,poolId:pool,poolName:'Reporting pool',sourceId:source,sourceName:'Warehouse',count:2},quarantine] as DashboardFinding[],error:false,loading:false,admin:true,custody:false,reads:[] as string[]};
 await page.addInitScript(()=>{class Stream{onmessage:((m:{data:string})=>void)|null=null;constructor(){Object.defineProperty(window,'dashboardStream',{value:this,configurable:true});}close(){}}Object.defineProperty(window,'EventSource',{value:Stream});});
 await page.route('**/api/v1/**',async route=>{const path=new URL(route.request().url()).pathname;state.reads.push(path);
 if(path.endsWith('/auth/me'))return route.fulfill({json:{id:source,email:'admin@example.com',fullName:'Admin',timezone:'America/Toronto',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
 if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id:source,name:'Example Company'},industry:{id:source,name:'Reinsurance'},region:'eu-west-1',role:state.admin?'admin':'viewer'}],nextCursor:null}});
 if(path.endsWith('/token-key'))return route.fulfill({json:{currentVersion:1,versions:state.custody?[{version:1,state:'current',createdAt:'2026-09-01T12:00:00Z',createdBy:null,reason:null,backupVerifiedAt:null,lastRehearsedAt:'2026-09-28T12:00:00Z',lastRehearsal:'failed'}]:[]}});
 if(state.loading)await new Promise(r=>setTimeout(r,800));
 if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Dashboard facts are temporarily unavailable. Retry the request.',requestId:'test',retryable:true}}});
 if(path.endsWith('/stats'))return route.fulfill({json:state.stats});
 if(path.endsWith('/dashboard/feed'))return route.fulfill({json:{items:state.findings,nextCursor:null}});
 if(path.endsWith('/dashboard/pools'))return route.fulfill({json:{items:state.shields,nextCursor:null}});
 if(path.endsWith('/'+pool))return route.fulfill({json:{...shield,sourceIds:[source],modeQuery:true,modePrompt:true,workingKeys:0,activeAgents:0,clearElements:80,activeElements:100,keys:[],graceSeconds:86400}});
 if(path.endsWith('/agents'))return route.fulfill({json:{items:[],nextCursor:null}});
 return route.fulfill({status:404,json:{}});
 });return state;
}
