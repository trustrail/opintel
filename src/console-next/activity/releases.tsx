import {useQuery} from '@tanstack/react-query';
import {createApiClient} from '../../shared/api/client.js';
import {ActivityPage,EvidenceDetail} from '../../shared/api/activity.js';
import {pages,read} from '../api.js';
import {ListState} from '../home/screen.js';
export const releaseKeys={list:(project:string,pool?:string)=>['console-next','project',project,'recorded-releases',pool??'all'] as const};
export function useRecordedReleases(project:string,pool?:string){return useQuery({queryKey:releaseKeys.list(project,pool),retry:false,queryFn:async({signal})=>{
 const client=createApiClient(undefined,{signal}),runs=await pages(client,`/api/v1/projects/${project}/runs?`+new URLSearchParams({limit:'100',...(pool?{poolId:pool}:{})}),ActivityPage,Infinity),events=[];
 for(let i=0;i<runs.items.length;i+=4){const details=await Promise.all(runs.items.slice(i,i+4).map(r=>read(client,`/api/v1/runs/${r.id}?`+new URLSearchParams({projectId:project,startedAt:r.startedAt}),EvidenceDetail)));for(const detail of details)events.push(...detail.releaseEvents.filter(e=>e.kind==='granted'));}
 return [...new Map(events.map(e=>[e.grantId,e])).values()].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.grantId.localeCompare(a.grantId));
}});}
export const provenanceLink=(project:string,id:string)=>'/?'+new URLSearchParams({project,screen:'activity',provenance:id});
export function CustodyReleases({project,pool}:{project:string;pool:string}){const query=useRecordedReleases(project,pool);return <section><h2>Custody releases</h2>{query.isPending?<ListState state="loading"/>:query.isError?<ListState state="error" error={query.error} retry={()=>{void query.refetch();}}/>:query.data.length?<ul data-custody-events>{query.data.map(e=><li key={e.grantId}><a href={provenanceLink(project,e.grantId)}>Provenance · {e.grantId} · <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time></a></li>)}</ul>:<p>No recorded custody releases.</p>}</section>;}
