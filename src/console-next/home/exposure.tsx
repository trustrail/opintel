import {consoleLink} from '../../shared/console-destinations.mjs';
import {useQuery} from '@tanstack/react-query';
import {createApiClient} from '../../shared/api/client.js';
import {PoolPage} from '../../shared/api/pools.js';
import {MemberPage} from '../../shared/api/entitlement-groups.js';
import {Dialog} from '../components/primitives.js';
import {Glyph,KindIcon} from '../components/kind.js';
import {treatmentNames,type Treatment} from '../components/treatment.js';
import {homeKeys,pages} from './data.js';
export function ExposureDetails({project,kind,onClose}:{project:string;kind:Treatment|null;onClose:()=>void}){
 const query=useQuery({queryKey:homeKeys.exposure(project,kind),enabled:kind!==null,retry:false,queryFn:async({signal})=>{
  const client=createApiClient(undefined,{signal}),pools=await pages(client,`/api/v1/projects/${project}/pools?limit=100`,PoolPage);
  const result=await Promise.all(pools.items.map(async pool=>{const members=await pages(client,`/api/v1/pools/${pool.id}/entitlement-members?`+new URLSearchParams({projectId:project,mode:'name',decision:'all',limit:'100'}),MemberPage);return {pool,members:members.items.filter(m=>(m.treatment??'undecided')===kind),complete:members.complete};}));
  return {items:result.flatMap(r=>r.members.map(member=>({pool:r.pool,member}))),complete:pools.complete&&result.every(r=>r.complete)};
 }});
 return <Dialog.Root open={kind!==null} onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal><Dialog.Overlay data-overlay/><Dialog.Content data-dialog><Dialog.Title>{kind?treatmentNames[kind]:''} columns</Dialog.Title><Dialog.Description>Column decisions across pools, filtered to this treatment. The same column can have a different decision in each pool.</Dialog.Description>{query.isPending?<p role="status">Loading columns…</p>:query.isError?<div role="alert"><p>{query.error&&typeof query.error==='object'&&'message' in query.error?String(query.error.message):'Columns could not be loaded.'}</p><button onClick={()=>{void query.refetch();}}>Retry</button></div>:<><ul data-exposure-details>{query.data.items.length?query.data.items.map(({member,pool})=><li key={pool.id+member.id}><a href={consoleLink(`/projects/${project}/entitlements?poolId=${pool.id}&elementId=${member.id}`)}><span><KindIcon kind="column"/>{member.name??'Unnamed column'}</span><small><KindIcon kind="pool"/>{pool.name}<KindIcon kind="table"/>{member.objectLabel}</small></a></li>):<li>No columns have this treatment.</li>}</ul>{!query.data.complete&&<p>Partial list. Open Entitlements for the complete scope.</p>}</>}<Dialog.Close data-close aria-label="Close"><Glyph name="close"/></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
