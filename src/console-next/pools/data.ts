import {z} from 'zod';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {createApiClient} from '../../shared/api/client.js';
import {PoolPage,PoolDetail} from '../../shared/api/pools.js';
import {PoolTablesPage} from '../../shared/api/pool-tables.js';
import {MemberPage} from '../../shared/api/entitlement-groups.js';
import {AgentPresencePage,type AgentPresenceView} from '../../shared/api/agent-presence.js';
import {PoolRowObjects} from '../../shared/api/row-entitlements.js';
import {CatalogTreeResponse} from '../../shared/api/catalog.js';
import {NeedsYouPage} from '../../shared/api/needs-you.js';
import {homeKeys,pages,read} from '../home/data.js';
import {treatmentOrder,type Treatment} from '../components/treatment.js';
export const poolsKeys={all:(p:string)=>[...homeKeys.scope(p),'pools'] as const,facts:(p:string)=>[...poolsKeys.all(p),'facts'] as const,catalog:(p:string)=>[...poolsKeys.all(p),'catalog'] as const,rows:(p:string,pool:string)=>[...poolsKeys.all(p),'rows',pool] as const};
export const emptySpectrum=()=>({clear:0,tokenized:0,masked:0,aggregate_only:0,custody:0,withheld:0,undecided:0});
export const isConnected=(agent:AgentPresenceView)=>['connecting','active','idle'].includes(agent.state);
export async function readPools(project:string,client=createApiClient()){
 const list=await pages(client,`/api/v1/projects/${project}/pools?limit=100`,PoolPage,Infinity);
 const pools=[];
 // Bound fan-out so a large project cannot exhaust the browser's connection pool.
 for(const pool of list.items){
  const base=`/api/v1/pools/${pool.id}`,q=new URLSearchParams({projectId:project,limit:'100'});
  const [detail,tables,members,agents]=await Promise.all([read(client,`${base}?${q}`,PoolDetail),pages(client,`${base}/tables?${q}`,PoolTablesPage,Infinity),pages(client,`${base}/entitlement-members?${q}&mode=name&decision=all`,MemberPage,Infinity),pages(client,`${base}/agents?${q}`,AgentPresencePage,Infinity)]);
  const spectrum=emptySpectrum();for(const m of members.items)spectrum[m.treatment??'undecided']++;
  pools.push({detail,tables:tables.items,members:members.items,agents:agents.items,spectrum,connected:agents.items.filter(isConnected).length});
 }
 const needs=await pages(client,`/api/v1/projects/${project}/needs-you?limit=100`,NeedsYouPage,Infinity);
 const kinds:Record<string,'table'|'view'>={};for(const item of needs.items)for(const target of item.context?.targets??[])kinds[target.tableId]=target.kind;
 return {pools:pools.map(pool=>({...pool,kinds})),kinds,needs:needs.items};
}
export type PoolFacts=Awaited<ReturnType<typeof readPools>>['pools'][number];
export function usePools(project:string){return useQuery({queryKey:poolsKeys.facts(project),queryFn:({signal})=>readPools(project,createApiClient(undefined,{signal})),refetchInterval:15000,retry:false});}
export function usePoolRows(project:string,pool:string,enabled:boolean){return useQuery({queryKey:poolsKeys.rows(project,pool),enabled,retry:false,queryFn:async({signal})=>(await pages(createApiClient(undefined,{signal}),`/api/v1/pools/${pool}/row-entitlements?${new URLSearchParams({projectId:project,status:'all',search:''})}`,PoolRowObjects,Infinity)).items});}
export async function readTables(project:string,client=createApiClient()){
 const nodes=async(parent?:string)=>{const tables=[];let cursor:string|null=null;const seen=new Set<string>();
 do{const page:z.infer<typeof CatalogTreeResponse>=await read(client,`/api/v1/projects/${project}/catalog?${new URLSearchParams({limit:'100',...parent?{parent}:{},...cursor?{cursor}:{}})}`,CatalogTreeResponse);tables.push(...page.nodes);cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw new Error('Catalogue changed while loading. Retry.');if(cursor)seen.add(cursor);}while(cursor);return tables;};
 const sources=await nodes(),result=[];
 for(const source of sources)result.push({source:{id:source.id,name:source.label??'Unnamed source'},tables:await nodes(`objects:${source.id}`)});
 return result;
}
export function useTables(project:string,enabled:boolean){return useQuery({queryKey:poolsKeys.catalog(project),enabled,retry:false,queryFn:({signal})=>readTables(project,createApiClient(undefined,{signal}))});}
export function useRefreshPools(project:string,kind:'create'|'rows'|'credential'|'revoke',pool?:string){
 const cache=useQueryClient();return async()=>{
  const keys:ReadonlyArray<readonly string[]>=[poolsKeys.facts(project),...(kind==='rows'&&pool?[poolsKeys.rows(project,pool)]:[]),...(kind==='create'?[poolsKeys.catalog(project),homeKeys.facts(project),[...homeKeys.scope(project),'exposure']]:[]),...(kind==='rows'?[homeKeys.facts(project)]:[]),...(kind==='revoke'?[homeKeys.facts(project),homeKeys.agents(project),[...homeKeys.scope(project),'custody-receipts']]:[])];
  await Promise.all(keys.map(queryKey=>cache.invalidateQueries({queryKey})));
 };
}
export function sumPools(pools:PoolFacts[]){const spectrum=emptySpectrum();for(const p of pools)for(const kind of treatmentOrder)spectrum[kind]+=p.spectrum[kind];return {spectrum,columns:treatmentOrder.reduce((n,k)=>n+spectrum[k],0),connected:pools.reduce((n,p)=>n+p.connected,0),tables:pools.reduce((n,p)=>n+p.tables.length,0)};}
export function dataLink(project:string,pool:string,object?:string,element?:string,treatment?:Treatment){return `/projects/${project}/entitlements?${new URLSearchParams({poolId:pool,decision:'all',...object&&!element?{layout:'table'}:{},...element?{elementId:element}:{},...treatment?{treatment}:{}})}`;}
