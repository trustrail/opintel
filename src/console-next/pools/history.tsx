import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {RowDecision,RowDecisionHistory} from '../../shared/api/row-entitlements.js';
import {ProjectMemberListResponse} from '../../shared/api/tenancy-schemas.js';
import {createApiClient} from '../../shared/api/client.js';
import {read,pages} from '../home/data.js';
import {ListState} from '../home/screen.js';
import {KindChip} from '../components/chip.js';
import {ScrollArea} from '../components/primitives.js';
import {FixedList} from '../components/scope.js';
import {useTimestamp} from '../components/account.js';
import {poolsKeys} from './data.js';
export function RowHistory({project,pool,object}:{project:string;pool:string;object:string}){
 const [selected,setSelected]=useState(()=>new URLSearchParams(location.search).get('rowDecisionId')),stamp=useTimestamp();
 const history=useQuery({queryKey:poolsKeys.history(project,pool,object),retry:false,queryFn:async({signal})=> (await pages(createApiClient(undefined,{signal}),`/api/v1/pools/${pool}/row-entitlements/${object}/history?projectId=${project}`,RowDecisionHistory,Infinity)).items});
 const people=useQuery({queryKey:poolsKeys.people(project),retry:false,queryFn:async({signal})=> (await pages(createApiClient(undefined,{signal}),`/api/v1/projects/${project}/members?limit=100`,ProjectMemberListResponse,Infinity)).items});
 const recorded=useQuery({queryKey:poolsKeys.decision(project,selected??''),enabled:Boolean(selected),retry:false,queryFn:({signal})=>read(createApiClient(undefined,{signal}),`/api/v1/row-decisions/${selected}?projectId=${project}`,RowDecision)});
 const actor=(id:string)=>{const user=people.data?.find(p=>p.user.id===id)?.user;return user?.fullName??user?.email;};
 return <section data-row-history><h3>Decision history</h3>{selected&&<section aria-label="Historical row decision"><h4>Selected recorded decision</h4>{recorded.isPending?<ListState state="loading"/>:recorded.isError?<ListState state="error" error={recorded.error} retry={()=>{void recorded.refetch();}}/>:recorded.data&&<><code title={recorded.data.expression}>{recorded.data.expression}</code><time dateTime={recorded.data.decidedAt}>{stamp(recorded.data.decidedAt)}</time>{actor(recorded.data.actorId)&&<KindChip kind="person" name={actor(recorded.data.actorId)!} title="Current account name; not recorded on the decision"/>}</>}</section>}{history.isPending?<ListState state="loading"/>:history.isError?<ListState state="error" error={history.error} retry={()=>{void history.refetch();}}/>:!history.data.length?<p data-empty>No row decisions recorded.</p>:<ScrollArea.Root data-row-history-scroll><ScrollArea.Viewport><FixedList kind="row-history">{history.data.map(d=><li key={d.id} data-selected={selected===d.id}><button type="button" onClick={()=>setSelected(d.id)}><time dateTime={d.decidedAt}>{stamp(d.decidedAt)}</time><span>{actor(d.actorId)&&<KindChip kind="person" name={actor(d.actorId)!} title="Current account name"/>}</span><code title={d.expression}>{d.expression}</code></button></li>)}</FixedList></ScrollArea.Viewport><ScrollArea.Scrollbar orientation="vertical"><ScrollArea.Thumb/></ScrollArea.Scrollbar></ScrollArea.Root>}</section>;
}
