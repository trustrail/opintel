import type {ActivityEntry} from '../src/shared/api/activity.js';
import {entry,record} from './activity-fixture.js';
import type {ObservationGroup} from '../src/shared/api/observations.js';
import type {Suggestion} from '../src/shared/api/suggestions.js';
import type {Page} from '@playwright/test';
import type {DashboardStats,DashboardFinding,PoolShield} from '../src/shared/api/dashboard.js';
export const project='018f8f9d-7f83-7abc-8def-000000000001',pool='018f8f9d-7f83-7abc-8def-000000000002',source='018f8f9d-7f83-7abc-8def-000000000003',filing='018f8f9d-7f83-7abc-8def-000000000004';
export const spectrum={clear:80,tokenized:5,masked:4,aggregate_only:3,withheld:6,undecided:2};
export const dashboard:DashboardStats={asOf:'2026-09-29T00:30:00.000Z',utcDay:'2026-09-29',pools:1,sources:1,spectrum,requests:12,queries:10,prompts:2,refused:1,incomplete:1,connectedAgents:3,staleAgents:0};
export const shield:PoolShield={id:pool,name:'Reporting pool',agents:3,spectrum,sources:[{id:source,name:'Warehouse',spectrum}]};
export const quarantine:Extract<DashboardFinding,{kind:"quarantine"}>={id:'quarantine:'+filing,kind:'quarantine',filingId:filing,zoneId:source,category:'verification_mismatch',receivedAt:'2026-09-28T20:30:00Z'};
export const dashboardPath=`/projects/${project}/dashboard`;
export function joinSuggestion():Suggestion{
 const column=(id:string,object:string):Suggestion['left']=>({id,name:`warehouse.public.${object}.treaty_ref`,active:true,address:{sourceId:source,sourceName:'Warehouse',alias:'warehouse',schema:'public',object,column:'treaty_ref'},exposedType:'VARCHAR',treatments:[{poolId:pool,poolName:'Reporting pool',treatment:'tokenized'}],domain:{declared:null,effective:'opintelisolated'+id.replaceAll('-',''),provenance:'element_identity',memberCount:1}});
 return {id:filing,left:column(source,'premiums'),right:column(pool,'claims'),trend:Array.from({length:7},(_,i)=>({day:new Date(Date.UTC(2026,8,23+i)).toISOString().slice(0,10),queries:i===6?2:0,explains:i===6?3:0})),queries:2,explains:3,latestAt:'2026-09-29T00:00:00Z',latestAttemptId:filing,agents:['reporting-agent'],pools:[{id:pool,name:'Reporting pool'}],confirmationBlocked:null,status:'not_sure',raisedAgain:false,history:[]};
}
export async function mockDashboard(page:Page){
 const state={stats:structuredClone(dashboard),shields:[structuredClone(shield)],findings:[{id:'undecided:'+pool+':'+source,kind:'undecided' as const,poolId:pool,poolName:'Reporting pool',sourceId:source,sourceName:'Warehouse',count:2},quarantine] as DashboardFinding[],error:false,loading:false,admin:true,custody:false,reads:[] as string[], urls:[] as string[], rows:null as ActivityEntry[]|null, recent:[{...entry,startedAt:'2026-09-29T00:10:00Z'}], suggestions:[] as Suggestion[], observations:[{id:'filing:verification_mismatch:',kind:'filing',cause:'verification_mismatch',causeDetail:'',state:'open',count:1,oldestAt:quarantine.receivedAt,latestAt:quarantine.receivedAt}] as ObservationGroup[]};
 await page.addInitScript(()=>{class Stream{onmessage:((m:{data:string})=>void)|null=null;constructor(){Object.defineProperty(window,'dashboardStream',{value:this,configurable:true});}close(){}}Object.defineProperty(window,'EventSource',{value:Stream});});
 await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;state.reads.push(path);state.urls.push(url.pathname+url.search);
 if(path.endsWith('/auth/me'))return route.fulfill({json:{id:source,email:'admin@example.com',fullName:'Admin',timezone:'America/Toronto',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
 if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id:source,name:'Example Company'},industry:{id:source,name:'Reinsurance'},region:'eu-west-1',role:state.admin?'admin':'viewer'}],nextCursor:null}});
 if(path.endsWith('/token-key'))return route.fulfill({json:{currentVersion:1,versions:state.custody?[{version:1,state:'current',createdAt:'2026-09-01T12:00:00Z',createdBy:null,reason:null,backupVerifiedAt:null,lastRehearsedAt:'2026-09-28T12:00:00Z',lastRehearsal:'failed'}]:[]}});
 if(state.loading)await new Promise(r=>setTimeout(r,800));
 if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Dashboard facts are temporarily unavailable. Retry the request.',requestId:'test',retryable:true}}});
 const poolSummary={id:pool,name:'Reporting pool',sourceIds:[source],modeQuery:true,modePrompt:true,workingKeys:0,agents:0,activeAgents:0,clearElements:state.stats.spectrum.clear,activeElements:Object.values(state.stats.spectrum).reduce((a,b)=>a+b,0)};
 if(path.endsWith('/sources'))return route.fulfill({json:{items:[{id:source,name:'Warehouse',exposedAlias:'warehouse',kind:'postgres',origin:'customer',status:'ready',error:null,landingStrategy:null,filingCount:null,elementCount:poolSummary.activeElements,unsupportedCount:0,undecidedCount:state.stats.spectrum.undecided,latestIntrospectionId:null,lastIntrospectedAt:state.stats.asOf}],nextCursor:null}});
 if(path.endsWith('/pools'))return route.fulfill({json:{items:state.stats.pools?[poolSummary]:[],nextCursor:null}});
 if(path.endsWith('/entitlement-groups')){
  const pending=url.searchParams.get('decision')==='undecided',decisions=Object.entries(state.stats.spectrum).map(([value,count])=>({value,count})),count=pending?state.stats.spectrum.undecided:poolSummary.activeElements;
  const item={groupKey:'treaty_ref',name:'treaty_ref',count,types:[{value:'VARCHAR',count}],decisions:pending?[{value:'undecided',count}]:decisions,objects:1,queries:2,explains:3};
  return route.fulfill({json:{items:count?[item]:[],nextCursor:null,totals:{members:count,groups:count?1:0,undecided:state.stats.spectrum.undecided,decisions:pending?[{value:'undecided',count}]:decisions}}});
 }
 if(path.endsWith('/entitlement-members'))return route.fulfill({json:{items:[],nextCursor:null}});
 if(path.endsWith('/custody-observations')||path.endsWith('/observations')){
  const custody=path.endsWith('/custody-observations'),items=url.searchParams.get('view')==='resolved'?[]:custody?state.custody?[{id:'custody:custody_failed:',kind:'custody',cause:'custody_failed',causeDetail:'',state:'open',count:1,oldestAt:state.stats.asOf,latestAt:state.stats.asOf}]:[]:state.observations;
  return route.fulfill({json:{items,nextCursor:null,counts:{open:custody?Number(state.custody):state.observations.reduce((n,g)=>n+g.count,0),resolved:0}}});
 }
 if(path.endsWith('/observations/members'))return route.fulfill({json:{items:[{id:filing,kind:'filing',state:'open',observedAt:quarantine.receivedAt,resolvedAt:null,resolution:null,metadata:{filingId:filing,zoneId:source,engineId:null,engineName:null},history:[{at:quarantine.receivedAt,state:'open',resolution:null,cause:'verification_mismatch'}]}],nextCursor:null}});
 if(path.endsWith('/suggestions'))return route.fulfill({json:{items:state.suggestions,nextCursor:null,projectName:'Reporting'}});
 if(path.endsWith('/suggestions/domains'))return route.fulfill({json:{items:[],nextCursor:null}});
 const scoped=state.rows?.filter(r=>(!url.searchParams.has('from')||Date.parse(r.startedAt)>=Date.parse(url.searchParams.get('from')!))&&(!url.searchParams.has('to')||Date.parse(r.startedAt)<Date.parse(url.searchParams.get('to')!))&&(!url.searchParams.has('mode')||r.mode===url.searchParams.get('mode'))&&(!url.searchParams.has('poolId')||r.poolId===url.searchParams.get('poolId')));
 if(path.endsWith('/runs/summary')&&scoped){
  const zero=()=>({all:0,refused:0,incomplete:0,answerTreated:0}),counts=zero(),days=new Map<string,{day:string;counts:ReturnType<typeof zero>;outcomes:Record<string,number>}>();
  for(const r of scoped){const treated=(r.status==='answered'||r.status==='reduced')&&['tokenized','masked','aggregate_only'].some(t=>(r.metadata.delivered[t]??0)>0);counts.all++;if(r.status==='refused')counts.refused++;if(r.status==='incomplete')counts.incomplete++;if(treated)counts.answerTreated++;
   if(url.searchParams.has('outcome')&&r.status!==url.searchParams.get('outcome')||url.searchParams.has('answerTreated')&&!treated)continue;
   const date=r.startedAt.slice(0,10),day=days.get(date)??{day:date,counts:zero(),outcomes:{answered:0,reduced:0,refused:0,incomplete:0,clarify:0,failed:0}};day.counts.all++;if(r.status==='refused')day.counts.refused++;if(r.status==='incomplete')day.counts.incomplete++;if(treated)day.counts.answerTreated++;day.outcomes[r.status]=(day.outcomes[r.status]??0)+1;days.set(date,day);
  }return route.fulfill({json:{counts,days:[...days.values()]}});
 }
 if(path.endsWith('/runs/summary')){
  const mode=url.searchParams.get('mode'),all=mode==='query'?state.stats.queries:mode==='prompt'?state.stats.prompts:state.stats.requests,counts={all,refused:mode?0:state.stats.refused,incomplete:mode?0:state.stats.incomplete,answerTreated:0};
  return route.fulfill({json:{counts,days:[{day:state.stats.utcDay,counts,outcomes:{answered:Math.max(0,all-counts.refused-counts.incomplete),reduced:0,refused:counts.refused,incomplete:counts.incomplete,clarify:0,failed:0}}]}});
 }
 if(/\/runs\/[^/]+$/.test(path))return route.fulfill({json:{...record,id:path.split('/').at(-1),startedAt:state.recent[0]?.startedAt??record.startedAt}});
 if(path.endsWith('/runs'))return route.fulfill({json:{items:scoped?scoped.filter(r=>!url.searchParams.has('outcome')||r.status===url.searchParams.get('outcome')).slice(0,Number(url.searchParams.get('limit')??50)):state.recent,nextCursor:null}});
 if(path.endsWith('/stats'))return route.fulfill({json:state.stats});
 if(path.endsWith('/dashboard/feed'))return route.fulfill({json:{items:state.findings,nextCursor:null}});
 if(path.endsWith('/dashboard/pools'))return route.fulfill({json:{items:state.shields,nextCursor:null}});
 if(path.endsWith('/'+pool))return route.fulfill({json:{...shield,sourceIds:[source],modeQuery:true,modePrompt:true,workingKeys:0,activeAgents:0,clearElements:80,activeElements:100,keys:[],graceSeconds:86400}});
 if(path.endsWith('/agents'))return route.fulfill({json:{items:[],nextCursor:null}});
 return route.fulfill({status:404,json:{}});
 });return state;
}
