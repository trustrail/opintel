import {z} from 'zod';
import {createApiClient,type AppError} from '../../shared/api/client.js';
import {DashboardStats,DashboardFeed,type Spectrum} from '../../shared/api/dashboard.js';
import {PoolPage,type PoolSummary} from '../../shared/api/pools.js';
import {GroupPage,type EntitlementGroup} from '../../shared/api/entitlement-groups.js';
import {ObservationPage,type ObservationGroup} from '../../shared/api/observations.js';
import {SuggestionPage,type Suggestion} from '../../shared/api/suggestions.js';
import {ActivitySummary,ActivityPage,type ActivityEntry,type ActivityFilters} from '../../shared/api/activity.js';
import {AgentPresencePage,type AgentPresenceView} from '../../shared/api/agent-presence.js';
type Client=ReturnType<typeof createApiClient>;
export type DashboardPool={pool:PoolSummary;spectrum:Spectrum;pending:number;groups:number;demand:EntitlementGroup[];agents:AgentPresenceView[]};
export type DashboardModel={asOf:string;utcDay:string;sources:number;pools:DashboardPool[];spectrum:Spectrum;observations:ObservationGroup[];suggestions:Suggestion[];failures:z.infer<typeof DashboardFeed>['items'];days:Array<{day:string;requests:number;queries:number;prompts:number;refused:number;incomplete:number}>;recent:ActivityEntry[];today:ActivityFilters};
const changed=():AppError=>({code:'conflict',message:'The project changed while the Dashboard was loading. Refresh to read the complete scope.',requestId:null,retryable:true});
async function read<T>(client:Client,path:string,response:z.ZodType<T>){const result=await client.request({path,response});if(!result.ok)throw result.error;return result.value;}
async function pages<T>(client:Client,path:string,response:z.ZodType<{items:T[];nextCursor:string|null}>){
 const items:T[]=[],seen=new Set<string>();let cursor:string|null=null;
 do{const page:{items:T[];nextCursor:string|null}=await read(client,path+(path.includes('?')?'&':'?')+(cursor?'cursor='+encodeURIComponent(cursor):''),response);items.push(...page.items);cursor=page.nextCursor;if(cursor){if(seen.has(cursor))throw changed();seen.add(cursor);}}while(cursor);return items;
}
export function emptySpectrum():Spectrum{return {clear:0,tokenized:0,masked:0,aggregate_only:0,withheld:0,undecided:0};}
/** Destination APIs own every count. No competing SQL or inferred operations. */
export async function readDashboardModel(project:string,admin:boolean,client:Client=createApiClient()):Promise<DashboardModel>{
 const base=`/api/v1/projects/${project}`;
 const [stats,poolList,observations,suggestions,oldFeed]=await Promise.all([
  read(client,base+'/stats',DashboardStats),pages(client,base+'/pools',PoolPage),pages(client,base+'/observations?view=open',ObservationPage),pages(client,base+'/suggestions?view=open',SuggestionPage),pages(client,base+'/dashboard/feed',DashboardFeed),
 ]);
 const custody=admin?await pages(client,base+'/custody-observations?view=open',ObservationPage):[];
 const pools=await Promise.all(poolList.map(async(pool):Promise<DashboardPool>=>{
  const query=new URLSearchParams({projectId:project,mode:'name',prefix:'',decision:'all',limit:'1'}),path=`/api/v1/pools/${pool.id}/entitlement-groups?${query}`;
  const all=await read(client,path,GroupPage),pendingQuery=new URLSearchParams({...Object.fromEntries(query),decision:'undecided',limit:'25'});
  const pendingPath=`/api/v1/pools/${pool.id}/entitlement-groups?${pendingQuery}`,first=await read(client,pendingPath,GroupPage),groups=[...first.items],seen=new Set<string>();let cursor=first.nextCursor;
  while(cursor){if(seen.has(cursor))throw changed();seen.add(cursor);const page=await read(client,pendingPath+'&cursor='+encodeURIComponent(cursor),GroupPage);if(page.totals.members!==first.totals.members||page.totals.groups!==first.totals.groups)throw changed();groups.push(...page.items);cursor=page.nextCursor;}
  if(groups.length!==first.totals.groups)throw changed();
  const spectrum=emptySpectrum();for(const d of all.totals.decisions)spectrum[d.value]=d.count;
  const agents=await pages(client,`/api/v1/pools/${pool.id}/agents?projectId=${project}`,AgentPresencePage);
  return {pool,spectrum,pending:first.totals.members,groups:first.totals.groups,demand:groups.filter(g=>g.queries+g.explains>0),agents};
 }));
 const end=new Date(Date.parse(stats.asOf)+1).toISOString(),today={from:stats.utcDay+'T00:00:00.000Z',to:end};
 const start=new Date(Date.parse(today.from)-6*86400000).toISOString(),range={from:start,to:end};
 const summary=(mode?:'query'|'prompt')=>read(client,base+'/runs/summary?'+new URLSearchParams({...range,...(mode?{mode}:{})}),ActivitySummary);
 const [all,queries,prompts,recent]=await Promise.all([summary(),summary('query'),summary('prompt'),read(client,base+'/runs?limit=5',ActivityPage)]);
 const spectrum=emptySpectrum();for(const p of pools)for(const key of Object.keys(spectrum) as Array<keyof Spectrum>)spectrum[key]+=p.spectrum[key];
 const days=Array.from({length:7},(_,n)=>{const day=new Date(Date.parse(start)+n*86400000).toISOString().slice(0,10),counts=all.days.find(d=>d.day===day)?.counts;return {day,requests:counts?.all??0,queries:queries.days.find(d=>d.day===day)?.counts.all??0,prompts:prompts.days.find(d=>d.day===day)?.counts.all??0,refused:counts?.refused??0,incomplete:counts?.incomplete??0};});
 return {asOf:stats.asOf,utcDay:stats.utcDay,sources:stats.sources,pools,spectrum,observations:[...observations,...custody],suggestions,failures:oldFeed.filter(f=>f.kind==='source_failure'),days,recent:recent.items.map(r=>({...r,request:null})),today};
}
