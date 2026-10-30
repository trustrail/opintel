import {useQuery} from '@tanstack/react-query';
import {ActivityPage,ActivitySummary,EvidenceDetail,type ActivityEntry} from '../../shared/api/activity.js';
import {RowDecision} from '../../shared/api/row-entitlements.js';
import {createApiClient} from '../../shared/api/client.js';
import {homeKeys,pages,read} from '../home/data.js';
import {readPools,isConnected} from '../pools/data.js';
import type {Outcome} from './state.js';
export const activityKeys={all:(p:string)=>[...homeKeys.scope(p),'activity'] as const,facts:(p:string,pool:string|null)=>[...activityKeys.all(p),'facts',pool] as const,detail:(p:string,id:string,at:string)=>[...activityKeys.all(p),'detail',id,at] as const,decisions:(p:string,ids:string[])=>[...activityKeys.all(p),'row-decisions',...ids.toSorted()] as const};
export const captured=(r:ActivityEntry)=>r.recordKind==='full'&&r.captureSelected&&r.detailCaptured===true;
export function category(r:ActivityEntry):Exclude<Outcome,'connected'>|'other'{
 if(r.status==='refused'||r.status==='incomplete')return r.status;
 if(!['answered','reduced'].includes(r.status)||(!captured(r)&&r.recordKind!=='rollup'))return 'other';
 const d=r.metadata.delivered;if((d.custody??0)>0)return 'custody';if((d.tokenized??0)+(d.masked??0)+(d.aggregate_only??0)>0)return 'treated';return (d.clear??0)>0?'clear':'other';
}
export function range(now=new Date()){return {from:now.toISOString().slice(0,10)+'T00:00:00.000Z',to:new Date(now.getTime()+1).toISOString()};}
export async function readActivity(project:string,pool:string|null,client=createApiClient(),now=new Date()){
 const scope={...range(now),...pool?{poolId:pool}:{}},q=new URLSearchParams(scope),[runs,summary,pools]=await Promise.all([pages(client,`/api/v1/projects/${project}/runs?${q}&limit=100`,ActivityPage,Infinity),read(client,`/api/v1/projects/${project}/runs/summary?${q}&bucket=15m`,ActivitySummary),readPools(project,client)]);
 return {runs:runs.items,summary,...pools,...scope};
}
export type ActivityFacts=Awaited<ReturnType<typeof readActivity>>;
export function useActivity(project:string,pool:string|null,live:boolean){return useQuery({queryKey:activityKeys.facts(project,pool),queryFn:({signal})=>readActivity(project,pool,createApiClient(undefined,{signal})),retry:false,refetchInterval:live?false:15000});}
export function useReceipt(project:string,selected:{id:string;startedAt:string}|null,live:boolean){return useQuery({queryKey:activityKeys.detail(project,selected?.id??'',selected?.startedAt??''),enabled:Boolean(selected),queryFn:({signal})=>read(createApiClient(undefined,{signal}),`/api/v1/runs/${selected!.id}?${new URLSearchParams({projectId:project,startedAt:selected!.startedAt})}`,EvidenceDetail),retry:false,refetchInterval:live?false:15000});}
export function useDecisions(project:string,ids:string[],enabled:boolean){return useQuery({queryKey:activityKeys.decisions(project,ids),enabled:enabled&&ids.length>0,retry:false,queryFn:async({signal})=>{const client=createApiClient(undefined,{signal}),items=[];for(const id of ids)items.push(await read(client,`/api/v1/row-decisions/${id}?projectId=${project}`,RowDecision));return items;}});}
export function filterRuns(facts:ActivityFacts,filter:Outcome|null,agent:string,bucket:string|null){return facts.runs.filter(r=>(!filter||(filter==='named'?Boolean(r.agentId):filter==='connected'?facts.pools.some(p=>p.detail.id===r.poolId&&p.agents.some(a=>isConnected(a)&&a.agentId===r.agentId)):category(r)===filter))&&(!agent||r.agentId===agent)&&(!bucket||(Date.parse(r.startedAt)>=Date.parse(bucket)&&Date.parse(r.startedAt)<Date.parse(bucket)+900000)));}
export function todayBuckets(facts:ActivityFacts){if(!facts.summary.buckets)return null;const start=Date.parse(facts.from),end=Date.parse(facts.to);return Array.from({length:Math.ceil((end-start)/900000)},(_,i)=>{const at=new Date(start+i*900000).toISOString(),stored=facts.summary.buckets!.find(b=>Date.parse(b.at)===Date.parse(at));return {at,answered:(stored?.clear??0)+(stored?.treated??0)+(stored?.unknown??0),custody:stored?.custody??0,refused:stored?.refused??0};});}
