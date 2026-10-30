import {useQuery,useQueryClient} from '@tanstack/react-query';
import {SourceListResponse} from '../../shared/api/source-schemas.js';
import {SuggestionPage,DomainPage} from '../../shared/api/suggestions.js';
import {EnginePage} from '../../shared/api/engines.js';
import {createApiClient} from '../../shared/api/client.js';
import {readCatalogLevel,readPools,poolsKeys,emptySpectrum} from '../pools/data.js';
import {homeKeys,pages} from '../home/data.js';
export const dataKeys={all:(p:string)=>[...homeKeys.scope(p),'data'] as const,facts:(p:string)=>[...dataKeys.all(p),'facts'] as const,suggestions:(p:string)=>[...dataKeys.all(p),'suggestions'] as const,domains:(p:string)=>[...dataKeys.all(p),'domains'] as const,engines:(p:string)=>[...dataKeys.all(p),'engines'] as const};
export function estimateTotal(values:readonly (number|null|undefined)[]){return values.some(v=>v===null||v===undefined)?null:values.reduce<number>((sum,v)=>sum+(v??0),0);}
export function rowsLabel(value:number|null|undefined){return value===null||value===undefined?'unknown':'~'+value.toLocaleString('en-US',{notation:'compact',maximumFractionDigits:1});}
export async function readData(project:string,client=createApiClient()){
 const [sourcePage,poolData]=await Promise.all([pages(client,`/api/v1/projects/${project}/sources?limit=100`,SourceListResponse,Infinity),readPools(project,client)]),tables=[];
 for(const source of sourcePage.items){for(const node of await readCatalogLevel(project,`objects:${source.id}`,client)){
  const columns=await readCatalogLevel(project,node.id,client),pools=poolData.pools.filter(p=>p.detail.sourceIds.includes(source.id)).map(p=>{const members=p.members.filter(m=>m.objectId===node.id);return {pool:p.detail,members,spectrum:members.filter(m=>m.exposedType!==null).reduce((s,m)=>{s[m.treatment??'undecided']++;return s;},emptySpectrum())};}).filter(p=>p.members.length>0),open=pools.reduce((sum,p)=>sum+p.spectrum.undecided,0);
  tables.push({node,source,columns,pools,open});
 }}return {sources:sourcePage.items,tables,pools:poolData.pools,needs:poolData.needs,kinds:poolData.kinds};
}
export type DataFacts=Awaited<ReturnType<typeof readData>>;
export type DataTable=DataFacts['tables'][number];
export function useData(project:string){return useQuery({queryKey:dataKeys.facts(project),queryFn:({signal})=>readData(project,createApiClient(undefined,{signal})),retry:false,refetchInterval:15000});}
export function useSuggestions(project:string,scope:{elementId?:string;poolId?:string}={}){return useQuery({queryKey:[...dataKeys.suggestions(project),scope],queryFn:async({signal})=>(await pages(createApiClient(undefined,{signal}),`/api/v1/projects/${project}/suggestions?${new URLSearchParams({view:'open',limit:'100',...scope})}`,SuggestionPage,Infinity)).items,retry:false,refetchInterval:15000});}
export function useDomains(project:string,enabled:boolean){return useQuery({queryKey:dataKeys.domains(project),enabled,queryFn:async({signal})=>(await pages(createApiClient(undefined,{signal}),`/api/v1/projects/${project}/suggestions/domains?limit=100`,DomainPage,Infinity)).items,retry:false});}
export function useEngines(project:string,enabled:boolean){return useQuery({queryKey:dataKeys.engines(project),enabled,queryFn:async({signal})=>(await pages(createApiClient(undefined,{signal}),`/api/v1/projects/${project}/engines?limit=100`,EnginePage,Infinity)).items,retry:false});}
export function useRefreshData(project:string){const cache=useQueryClient();return async()=>{await Promise.all([dataKeys.facts(project),dataKeys.suggestions(project),dataKeys.domains(project),poolsKeys.all(project),homeKeys.facts(project),[...homeKeys.scope(project),'exposure']].map(queryKey=>cache.invalidateQueries({queryKey})));};}
export function tableSpectrum(tables:DataTable[]){const s=emptySpectrum();for(const table of tables)for(const p of table.pools)for(const k of Object.keys(s) as Array<keyof typeof s>)s[k]+=p.spectrum[k];return s;}

export function scopedTables(tables:DataTable[],pool:string|null,element:string|null):DataTable[]{
 return tables.filter(t=>!element||t.columns.some(c=>c.id===element)).map(t=>{const pools=t.pools.filter(p=>!pool||p.pool.id===pool).map(p=>{const members=p.members.filter(m=>!element||m.id===element),spectrum=emptySpectrum();for(const member of members.filter(m=>m.exposedType!==null))spectrum[member.treatment??'undecided']++;return {...p,members,spectrum};});return {...t,pools,open:pools.reduce((n,p)=>n+p.spectrum.undecided,0)};}).filter(t=>!pool||t.pools.length>0);
}
