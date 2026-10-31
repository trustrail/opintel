import {read,pages,type Client} from '../api.js';
import {contextualNeeds,contextualHealth} from '../observations/data.js';
import {z} from 'zod';
import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {createApiClient} from '../../shared/api/client.js';
import {NeedsYouPage,type NeedsYouItem} from '../../shared/api/needs-you.js';
import {DashboardStats} from '../../shared/api/dashboard.js';
import {ActivityPage,ActivitySummary,EvidenceDetail,type ActivityEntry} from '../../shared/api/activity.js';
import {AgentPresencePage} from '../../shared/api/agent-presence.js';
import {PoolPage} from '../../shared/api/pools.js';
import {ProjectHealth} from '../../shared/api/project-health.js';
import {ProjectListResponse} from '../../shared/api/tenancy-schemas.js';
import {projectStreamCache} from '../stream-cache.js';
import type {Order} from './state.js';
export type Project=z.infer<typeof ProjectListResponse>['items'][number];
export const homeKeys={custody:(p:string,from:string,to:string)=>[...homeKeys.scope(p),'custody-receipts',from,to] as const,allProjects:()=>['console-next','project'] as const,projects:()=>['console-next','projects'] as const,scope:(p:string)=>['console-next','project',p] as const,facts:(p:string)=>[...homeKeys.scope(p),'home'] as const,agents:(p:string)=>[...homeKeys.scope(p),'connected-agents'] as const,exposure:(p:string,kind:string|null)=>[...homeKeys.scope(p),'exposure',kind] as const,health:(p:string)=>[...homeKeys.scope(p),'health'] as const};
export {read,pages} from '../api.js';
export type Minute={at:string;requests:number;refused:number;custody:number};
export function minuteStrip(runs:ActivityEntry[],now:Date):Minute[]{
 const start=Math.floor(now.getTime()/60000)*60000-29*60000;
 const minutes=Array.from({length:30},(_,i)=>({at:new Date(start+i*60000).toISOString(),requests:0,refused:0,custody:0}));
 for(const r of runs){const i=Math.floor((Date.parse(r.startedAt)-start)/60000),m=minutes[i];if(!m)continue;m.requests++;if(r.status==='refused')m.refused++;if((r.metadata.delivered.custody??r.treatmentCounts.custody??0)>0)m.custody++;}
 return minutes;
}
export async function readHome(project:string,client:Client=createApiClient(),now=new Date()){
 const base=`/api/v1/projects/${project}`,to=new Date(now.getTime()+1).toISOString(),from=now.toISOString().slice(0,10)+'T00:00:00.000Z';
 const stripFrom=new Date(Math.floor(now.getTime()/60000)*60000-29*60000).toISOString();
 const [stats,summary,needs,recent]=await Promise.all([
  read(client,base+'/stats',DashboardStats),read(client,base+'/runs/summary?'+new URLSearchParams({from,to}),ActivitySummary),
  pages(client,base+'/needs-you?limit=100',NeedsYouPage,Number.POSITIVE_INFINITY),pages(client,base+'/runs?'+new URLSearchParams({from:stripFrom,to,limit:'100'}),ActivityPage,10),
 ]);
 return {stats,summary,needs:await contextualNeeds(project,needs.items,client),needsComplete:needs.complete,minutes:recent.complete?minuteStrip(recent.items,now):null,asOf:now.toISOString(),from,to};
}
export type HomeData=Awaited<ReturnType<typeof readHome>>;
const decision=(item:NeedsYouItem)=>['undecided_entitlement','missing_row_decision','suggestion'].includes(item.kind);
export function orderNeeds(items:NeedsYouItem[],order:Order,role:Project['role']){
 const first=order==='all'?(role==='admin'?'decisions':'running'):order;
 return [...items].sort((a,b)=>Number(decision(b)===(first==='decisions'))-Number(decision(a)===(first==='decisions'))||a.id.localeCompare(b.id));
}
export type StreamConnection={onopen:((event:Event)=>void)|null;onerror:((event:Event)=>void)|null;onmessage:((event:MessageEvent)=>void)|null;close():void};
export type OpenStream=(url:string)=>StreamConnection;
const openStream:OpenStream=url=>new EventSource(url);
/** Lost streams poll immediately and every 15 s; reconnect snapshot refreshes the gap. */
export function useHomeStream(project:string,connect:OpenStream=openStream){
 const cache=useQueryClient(),[live,setLive]=useState(false);
 useEffect(()=>{
  setLive(false);let disposed=false;const consumer=projectStreamCache(cache,project);
  const stream=connect(`/api/v1/projects/${project}/stream`);
  stream.onopen=()=>{if(!disposed){setLive(true);consumer.refresh();}};
  stream.onerror=()=>{if(!disposed){setLive(false);consumer.refresh();}};
  stream.onmessage=message=>{if(disposed)return;try{consumer.receive(JSON.parse(message.data) as unknown);}catch{/* Malformed events cannot patch server facts. */}};
  return ()=>{disposed=true;consumer.dispose();stream.close();};
 },[project,cache,connect]);
 return live;
}
export function useProjects(){return useQuery<Project[]>({queryKey:homeKeys.projects(),refetchInterval:q=>q.state.data?.length?15000:false,queryFn:async({signal})=>(await pages(createApiClient(undefined,{signal}),'/api/v1/projects?limit=100',ProjectListResponse)).items,retry:false});}
export function useHome(project:string,live:boolean){return useQuery({queryKey:homeKeys.facts(project),queryFn:({signal})=>readHome(project,createApiClient(undefined,{signal})),retry:false,refetchInterval:live?false:15000});}
export function useHealth(project:string,live:boolean){return useQuery({queryKey:homeKeys.health(project),queryFn:async({signal})=>contextualHealth(project,(await read(createApiClient(undefined,{signal}),`/api/v1/projects/${project}/health`,ProjectHealth)).items),retry:false,refetchInterval:live?false:15000});}

export function useConnectedAgents(project:string,enabled:boolean){return useQuery({queryKey:homeKeys.agents(project),enabled,retry:false,queryFn:async({signal})=>{const client=createApiClient(undefined,{signal}),pools=await pages(client,`/api/v1/projects/${project}/pools?limit=100`,PoolPage);return Promise.all(pools.items.map(async pool=>({pool,agents:(await pages(client,`/api/v1/pools/${pool.id}/agents?projectId=${project}`,AgentPresencePage)).items.filter(a=>['connecting','active','idle'].includes(a.state))})));}});}

export async function readCustodyReceipts(project:string,from:string,to:string,expected:number,client:Client=createApiClient()){
 const receipts:Array<Pick<ActivityEntry,'id'|'startedAt'|'status'|'rowCount'>>=[];
 if(expected===0)return receipts;
 const runs=await pages(client,`/api/v1/projects/${project}/runs?`+new URLSearchParams({from,to,limit:'100'}),ActivityPage,Number.POSITIVE_INFINITY);
 for(let i=0;i<runs.items.length;i+=4){
  const batch=await Promise.all(runs.items.slice(i,i+4).map(async run=>{const detail=await read(client,`/api/v1/runs/${run.id}?`+new URLSearchParams({projectId:project,startedAt:run.startedAt}),EvidenceDetail);return detail.releaseEvents.some(e=>e.kind==='granted')?{id:run.id,startedAt:run.startedAt,status:run.status,rowCount:run.rowCount}:null;}));
  for(const receipt of batch)if(receipt)receipts.push(receipt);
 }
 return receipts;
}
export function useCustodyReceipts(project:string,from:string,to:string,expected:number,enabled:boolean){return useQuery({queryKey:homeKeys.custody(project,from,to),enabled,retry:false,queryFn:({signal})=>readCustodyReceipts(project,from,to,expected,createApiClient(undefined,{signal}))});}
