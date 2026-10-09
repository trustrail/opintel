import {useMemo,useEffect,type ReactNode} from 'react';
import {useStore} from 'zustand';
import {Link} from '@tanstack/react-router';
import {useMutation} from '@tanstack/react-query';
import {Button,AsyncButton,LoadingState,ErrorState,EmptyState,DenseList,ExposureSpectrum} from '../../shared/ui/index.js';
import {readMembers,type GroupFilter,type EntitlementGroup,type EntitlementMember} from '../../shared/api/entitlement-groups.js';
import {useGroups,useMembers,useBulk} from './data.js';
import {createEntitlementsState} from './state.js';
import {DecisionBar} from './decision-bar.js';
import {TreatmentIndicator} from './treatment.js';
import {PoolTree} from './table.js';
export function GroupedDecisions({projectId,poolId,poolName,sourceId,elementId,decision,mode,editable,renderFilters,renderHeader}:{renderHeader:(summary?:ReactNode)=>ReactNode;renderFilters:(pending:number|undefined,nameFilter?:ReactNode)=>ReactNode;projectId:string;poolId:string;poolName:string;sourceId?:string;elementId?:string;decision:GroupFilter['decision'];mode:GroupFilter['mode'];editable:boolean}){
 const store=useMemo(createEntitlementsState,[projectId,poolId]);const state=useStore(store);const filter:GroupFilter={projectId,sourceId,elementId,decision,mode,prefix:state.namePrefix,limit:50};
 const query=useGroups(poolId,filter),bulk=useBulk(projectId,poolId),totals=query.data?.pages[0]?.totals;
 const collect=useMutation({mutationFn:async({group,undecided}:{group?:string;undecided?:boolean})=>{const members:EntitlementMember[]=[];let cursor:string|undefined;do{const result=await readMembers(poolId,{...filter,group,decision:undecided?'undecided':filter.decision,cursor,limit:500});if(!result.ok)throw result.error;members.push(...result.value.items);cursor=result.value.nextCursor??undefined;}while(cursor);return members;},onSuccess:(members,input)=>{if(input.undecided)store.getState().clearSelection();store.getState().rememberMembers(members);store.getState().check(members.map(m=>m.id),true);},onSettled:()=>store.getState().queueGroup(null)});
 const busy=bulk.isPending||collect.isPending,treeMode=mode==='table'&&!elementId;
 return <>
 {renderHeader(totals?<section className="spec" aria-label="Decision distribution"><span className="meta">{totals.decisions.reduce((n,d)=>n+d.count,0)} members</span><ExposureSpectrum decisions={totals.decisions} unit="members" density="compact"/></section>:undefined)}
 {renderFilters(totals?.undecided,<input className="inp" id="entitlement-name" data-part="name-filter" aria-label="Column name starts with (all tables)" placeholder="Filter by name" value={filter.prefix} maxLength={63} disabled={busy} onChange={e=>state.filterName(e.target.value)}/>)}
 <div data-part="scope-summary">{editable&&totals&&totals.undecided>0&&decision!=='decided'?<Button disabled={busy} onClick={()=>collect.mutate({undecided:true})}>{collect.isPending?'Collecting members…':('Review all '+totals.undecided)}</Button>:null}</div>
 {totals?<p className="note">{totals.members} {totals.members===1?'member':'members'} in {totals.groups} visible {mode==='table'?(totals.groups===1?'table':'tables'):(totals.groups===1?'group':'groups')}.</p>:null}
 {collect.isError?<p role="alert">{collect.error.message}</p>:null}
 {query.isPending?<LoadingState/>:query.isError?<ErrorState title="Decisions could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:!totals?.members?<EmptyState title={decision==='undecided'?'No undecided elements':mode==='table'?'No catalogue yet':'No matching elements'} description="Change the decision, source or name filter to inspect another scope."/>:treeMode?<PoolTree projectId={projectId} poolId={poolId} sourceId={sourceId} undecided={decision==='undecided'} decided={decision==='decided'} editable={editable} externalStore={store} externalBusy={collect.isPending} elementPrefix={filter.prefix} poolName={poolName}/>:<div className="card"><DenseList label="Entitlement groups" kindScope="uniform">{query.data.pages.flatMap(p=>p.items).map(group=><Group key={group.groupKey} group={group} poolId={poolId} filter={filter} editable={editable} busy={busy} store={store} select={()=>collect.mutate({group:group.groupKey})}/>)}</DenseList></div>}
 {!treeMode&&query.hasNextPage?<AsyncButton variant="ghost" disabled={busy||query.isFetchingNextPage} pendingLabel="Loading…" refusal={query.isError?query.error.message:null} run={()=>query.fetchNextPage()}>Load more groups</AsyncButton>:null}
 {!treeMode?<DecisionBar store={store} projectId={projectId} poolName={poolName} editable={editable} bulk={bulk} disabled={collect.isPending}/>:null}
 <p className="note">Undecided is the absence of a decision. Decisions cannot be reset to undecided. Only explicitly selected members are changed; future discoveries are not included.</p>
 </>;
}
function Group({group,poolId,filter,editable,busy,store,select}:{group:EntitlementGroup;poolId:string;filter:GroupFilter;editable:boolean;busy:boolean;store:ReturnType<typeof createEntitlementsState>;select:()=>void}){
 const state=useStore(store),open=!!state.expanded[group.groupKey],id=`entitlement-group-${encodeURIComponent(group.groupKey)}`;
 useEffect(()=>{if(filter.elementId&&store.getState().expanded[group.groupKey]===undefined)store.getState().toggle(group.groupKey);},[filter.elementId,group.groupKey,store]);
 const variants=group.decisions.reduce((n,d)=>n+(d.value==='masked'?Math.max(group.maskKinds.length,1):1),0);
 const selectedCount=(state.groupMembers[group.groupKey]??[]).filter(id=>state.selected.has(id)).length;
 const type=group.types.length===1?group.types[0]?.value??'Unsupported':group.types.map(t=>t.value??'Unsupported').join(' · ');
 return <div role="listitem" data-mark-row="true" data-row-kind="element">
 <div className="trow" data-row="entitlement-group" data-selected={selectedCount>0}>
 <span data-part="selection">{editable?<input type="checkbox" ref={node=>{if(node)node.indeterminate=selectedCount>0&&selectedCount<group.count;}} aria-label={`Select ${group.name}`} disabled={busy} checked={state.pendingGroup===group.groupKey||((state.groupMembers[group.groupKey]?.length??0)===group.count&&state.groupMembers[group.groupKey]!.every(id=>state.selected.has(id)))} aria-busy={state.pendingGroup===group.groupKey} onChange={e=>{if(e.target.checked){state.queueGroup(group.groupKey);select();}else state.check(state.groupMembers[group.groupKey]??[],false);}}/>:null}</span>
 <div data-part="identity"><b title={group.name}>{group.name}</b><span className="meta">{group.count} members{group.types.length>1?` · Mixed · ${group.types.length} types`:''}{variants>1?` · Mixed · ${variants} decisions`:''}</span></div>
 <span data-part="treatments" role="list" aria-label="Treatments present" data-mark-list="uniform">{group.decisions.map(d=><span key={d.value} role="listitem" data-mark-row="true" data-row-kind="treatment"><TreatmentIndicator value={d.value}/></span>)}</span>
 <span data-part="type" className="type" title={type}>{type}</span>
 <span data-part="demand" className="meta" title={group.queries+group.explains?`Join attempted · ${group.queries} query · ${group.explains} explain`:undefined}>{group.queries+group.explains?`Join attempted · ${group.queries} query · ${group.explains} explain`:null}</span>
 <button type="button" className="btn ghost" disabled={busy} aria-expanded={open} aria-controls={id} aria-label={open?'Hide members':'Members / Declarations'} onClick={()=>state.toggle(group.groupKey)}>{open?'Hide':'Members'}</button>
 </div>
 <div id={id} hidden={!open}>{open?<Members poolId={poolId} filter={filter} group={group.groupKey} editable={editable} busy={busy} store={store}/>:null}</div>
 </div>;
}
function Members({poolId,filter,group,editable,busy,store}:{poolId:string;filter:GroupFilter;group:string;editable:boolean;busy:boolean;store:ReturnType<typeof createEntitlementsState>}){
 const query=useMembers(poolId,{...filter,group}),state=useStore(store);
 useEffect(()=>{if(query.data)store.getState().rememberMembers(query.data.pages.flatMap(p=>p.items));},[query.data,store]);
 return <>{query.isPending?<LoadingState/>:query.isError?<ErrorState title="Members could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:!query.data.pages[0]?.items.length?<EmptyState title="No members remain in scope" description="Refresh the groups before deciding."/>:<DenseList label="Group members" kindScope="uniform">{query.data.pages.flatMap(p=>p.items).map(m=><div className="trow" data-row="entitlement-member" data-selected={state.selected.has(m.id)} role="listitem" data-mark-row="true" data-row-kind="element" key={m.id}>
 <span data-part="selection">{editable?<input type="checkbox" aria-label={`Select ${m.qualifiedName}`} checked={state.selected.has(m.id)} disabled={busy||m.exposedType===null} onChange={e=>state.check([m.id],e.target.checked)}/>:null}</span>
 <div data-part="identity"><b title={m.qualifiedName}>{m.objectLabel}</b></div>
 <span className="type" data-part="type" title={/^money(?:\[\])*$/iu.test(m.sourceType)?'Money values depend on the source server’s lc_monetary; verify its monetary locale before deciding access.':undefined}>{m.exposedType??'Unsupported type'}</span>
 <span data-part="treatments"><TreatmentIndicator value={m.treatment??'undecided'}/></span>
 <Link data-part="declarations" aria-label={`Declarations for ${m.qualifiedName}`} className="btn ghost" to="/projects/$projectId/$screen" params={{projectId:filter.projectId,screen:'catalog'}} search={{elementId:m.id}}>Declarations</Link>
 </div>)}</DenseList>}{query.hasNextPage?<AsyncButton variant="ghost" disabled={busy||query.isFetchingNextPage} pendingLabel="Loading…" refusal={query.isError?query.error.message:null} run={()=>query.fetchNextPage()}>Load more members</AsyncButton>:null}</>;
}
