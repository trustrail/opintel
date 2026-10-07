import type {ReactNode} from 'react';
import {GroupedDecisions} from './grouped.js';
import {Button,PickerChevron,SegmentedFilters,EmptyState,ErrorState,LoadingState} from '../../shared/ui/index.js';
import {useSources} from '../sources/data.js';
import {usePools} from './data.js';
import {useProjects} from '../tenancy/data.js';
export type EntitlementsSearch={poolId?:string;sourceId?:string;elementId?:string;undecided?:boolean;decision?:'undecided'|'decided'|'all';layout?:'name'|'table'};
export function EntitlementsScreen({projectId,search,onSearch}:{projectId:string;search:EntitlementsSearch;onSearch:(search:EntitlementsSearch)=>void}){
 const pools=usePools(projectId),sources=useSources(projectId),projects=useProjects();
 const pool=pools.data?.find(p=>p.id===search.poolId)??(!search.poolId?pools.data?.[0]:undefined);
 const decision=search.decision??(search.undecided===false?'all':'undecided'),layout=search.layout??'name';

 const renderFilters=(pending:number|undefined,nameFilter?:ReactNode)=><div className="filters" data-part="decision-toolbar">
 <SegmentedFilters label="Decision filter" value={decision} options={[{value:'undecided',label:'Needs a decision',count:pending},{value:'decided',label:'Decided'},{value:'all',label:'Everything'}]} onChange={value=>onSearch({...search,poolId:pool?.id,decision:value})}/>
 <SegmentedFilters label="Group elements" value={layout} options={[{value:'name',label:'By name'},{value:'table',label:'By table'}]} onChange={value=>onSearch({...search,poolId:pool?.id,layout:value})}/>
 <span className="pick"><label htmlFor="entitlement-pool">Pool</label><select id="entitlement-pool" value={pool?.id??''} onChange={e=>onSearch({poolId:e.target.value})}>{!pool?<option value="">Choose a pool</option>:null}{pools.data?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><PickerChevron/></span>
 <span className="pick"><label htmlFor="entitlement-source">Source</label><select id="entitlement-source" value={search.sourceId??''} onChange={e=>onSearch({...search,poolId:pool?.id,sourceId:e.target.value||undefined})}><option value="">All bound sources</option>{sources.data?.filter(s=>pool?.sourceIds.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><PickerChevron/></span>
 {nameFilter}</div>;
 const renderHeader=(summary?:ReactNode)=><header className="tiles" data-part="title-band"><div><h1>Entitlements</h1><p className="sub">Decide what this pool may see. Elements without a decision are undecided and absent from the agent’s view.</p></div>{summary}</header>;
 const editable=projects.data?.find(p=>p.id===projectId)?.role==='admin';
 return <section className="screen on" data-layout="decisions">
 {search.elementId?<p className="note">Showing the element linked from Suggestions. <Button variant="ghost" onClick={()=>onSearch({...search,elementId:undefined})}>Show all elements</Button></p>:null}
 {pools.isPending?<>{renderHeader()}<LoadingState/></>:pools.isError?<>{renderHeader()}<ErrorState title="Pools could not be loaded" description={pools.error.message} retry={()=>pools.refetch()}/></>:!pools.data.length?<>{renderHeader()}<EmptyState title="No pools yet" description="Create a pool and bind a source before deciding its entitlements."/></>:<>

 {pool?<GroupedDecisions key={JSON.stringify([projectId,pool.id,search.sourceId,search.elementId,decision,layout])} projectId={projectId} poolId={pool.id} poolName={pool.name} sourceId={search.sourceId} elementId={search.elementId} decision={decision} mode={layout} editable={editable} renderFilters={renderFilters} renderHeader={renderHeader}/>:<>{renderHeader()}{renderFilters(undefined)}<EmptyState title="Pool not found" description="Choose an available pool."/></>}</>}
 </section>;
}
