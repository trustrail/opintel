import {useMemo,useId} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import {useQuery,useQueryClient,keepPreviousData} from '@tanstack/react-query';
import {Link} from '@tanstack/react-router';
import {readPoolRowObjects,type PoolRowFilter} from '../../shared/api/row-entitlements.js';
import {Button,LoadingState,ErrorState,Mark} from '../../shared/ui/index.js';
import {ObjectPicker} from '../../shared/ui/object-picker.js';
import {DenseList,DenseRow} from '../../shared/ui/patterns.js';
import {Timestamp} from '../settings/preferences.js';
import {entitlementKeys} from '../entitlements/data.js';
import {RowEditor} from '../entitlements/row-editor.js';
type State={object:string|null;picker:boolean;status:PoolRowFilter['status'];search:string;cursors:(string|undefined)[];pickerSearch:string;pickerCursors:(string|undefined)[]};
export function PoolRowEntitlements({projectId,poolId}:{projectId:string;poolId:string}){
 const cache=useQueryClient(),id=useId(),store=useMemo(()=>createStore<State>(()=>({object:null,picker:false,status:'overridden',search:'',cursors:[undefined],pickerSearch:'',pickerCursors:[undefined]})),[poolId]),state=useStore(store);
 const filter={status:state.status,search:state.search,cursor:state.cursors.at(-1)},pickerFilter={status:'all' as const,search:state.pickerSearch,cursor:state.pickerCursors.at(-1)};
 const load=async(f:PoolRowFilter)=>{const r=await readPoolRowObjects(projectId,poolId,f);if(!r.ok)throw r.error;return r.value;};
 const query=useQuery({queryKey:entitlementKeys.rowObjects(projectId,poolId,filter),queryFn:()=>load(filter),placeholderData:keepPreviousData}),picker=useQuery({queryKey:entitlementKeys.rowObjects(projectId,poolId,pickerFilter),queryFn:()=>load(pickerFilter),enabled:state.picker});
 const select=(status:PoolRowFilter['status'])=>store.setState({status,search:'',cursors:[undefined]});
 const add=()=>store.setState({picker:true,pickerSearch:'',pickerCursors:[undefined]});
 const counts=query.data?.counts;
 const hasDecisions=!!counts&&(state.status==='overridden'?counts.overridden:state.status==='inherited'?counts.inherited:counts.missing)>0;
 const previewCount=(object:string,decision:string|undefined)=>{const cached=cache.getQueryData<{decisionId:string;count:number|null;belowThreshold:boolean}>(entitlementKeys.rowPreview(projectId,poolId,object));return cached&&cached.decisionId===decision?<p className="note">Cached preview · {cached.belowThreshold?'below the disclosure threshold':`${cached.count} entitled rows`}</p>:null;};
 return <section className="seg" aria-label="Pool row entitlements"><h2>Row access</h2>
 {counts?<div className="filters" aria-label="Row access summary">
 <button className={counts.missing?'gchip alarm':'gchip'} type="button" aria-pressed={state.status==='missing'} onClick={()=>select('missing')}>{counts.missing?<Mark name="needs-a-decision" size={16}/>:null}{state.status==='missing'?<b>{counts.missing} missing filters</b>:<span>{counts.missing} missing filters</span>}</button>
 <button className="gchip" type="button" aria-pressed={state.status==='overridden'} onClick={()=>select('overridden')}>{state.status==='overridden'?<b>{counts.overridden} overrides</b>:<span>{counts.overridden} overrides</span>}</button>
 <button className="gchip" type="button" aria-pressed={state.status==='inherited'} onClick={()=>select('inherited')}>{state.status==='inherited'?<b>{counts.inherited} inherit a default</b>:<span>{counts.inherited} inherit a default</span>}</button>
 <Link className="gchip" to="/projects/$projectId/$screen" params={{projectId,screen:'entitlements'}} search={{poolId,layout:'table',decision:'all',rowFilter:'unscoped'}}>{counts.unscoped} no row filter</Link>
 <span className="note">Row filters are set once per object in Entitlements as a default; an override here narrows that default for this pool only.</span>
 {counts.missing?<Link to="/projects/$projectId/dashboard" params={{projectId}} hash="row-access-needs-you">Needs You · missing filters</Link>:null}</div>:null}
 {counts&&(hasDecisions||state.status!=='overridden')?<div className="filters">{hasDecisions?<><label htmlFor={id}>Search by object name</label><input className="inp" id={id} value={state.search} onChange={e=>store.setState({search:e.target.value,cursors:[undefined]})}/></>:null}<Button variant="ghost" onClick={add}>Add override</Button></div>:null}
 {query.isPending||query.isPlaceholderData?<LoadingState/>:query.isError?<ErrorState title="Row access could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:<>
 {!query.data.items.length?<>{state.status==='overridden'&&!state.search?<>{query.data.projectHasDefault?<p>No overrides. This pool follows each object's default.</p>:<p>No object in this project has a row filter yet. Set a default in <Link to="/projects/$projectId/$screen" params={{projectId,screen:'entitlements'}} search={{poolId,layout:'table',decision:'all'}}>Entitlements</Link>, or add an override here to filter for this pool only.</p>}<Button variant="ghost" onClick={add}>Add override</Button></>:<p>{state.search?'No matching decisions.':state.status==='missing'?'No missing filters.':'No inherited defaults.'}</p>}</>:<DenseList label="Row access decisions" kindScope="uniform">{query.data.items.map(o=><DenseRow key={o.id} kind="object" identity={<><b>{o.name}</b><div className="rmeta">{o.sourceName}</div><div className="rtext">{o.decision?.words??(o.status==='missing'?'No effective filter — returns zero rows.':'Inherits from object default.')}</div>{previewCount(o.id,o.decision?.id)}{o.decision?<div className="rmeta">Last decided by {o.decision.actorName} · <Timestamp value={o.decision.decidedAt}/></div>:null}</>} actions={o.status==='inherited'?<Link className="btn ghost" to="/projects/$projectId/$screen" params={{projectId,screen:'entitlements'}} search={{poolId,layout:'table',decision:'all',rowObjectId:o.id}}>Open object {o.name}</Link>:<Button variant="ghost" onClick={()=>store.setState({object:o.id})}>{o.status==='missing'?'Add override':'Edit override'} for {o.name}</Button>}/>)}</DenseList>}
 {state.cursors.length>1||query.data.nextCursor?<div className="filters" aria-label="Row decision pages"><Button variant="ghost" disabled={state.cursors.length===1} onClick={()=>store.setState({cursors:state.cursors.slice(0,-1)})}>Previous decisions</Button><Button variant="ghost" disabled={!query.data.nextCursor} onClick={()=>store.setState({cursors:[...state.cursors,query.data.nextCursor??undefined]})}>Next decisions</Button></div>:null}</>}
 {state.picker?<ObjectPicker mode="single" items={picker.data?.items.map(o=>({...o,description:o.hasDefault?undefined:'no default'}))??[]} loading={picker.isPending} error={picker.error?.message??null} retry={()=>void picker.refetch()} search={state.pickerSearch} onSearch={pickerSearch=>store.setState({pickerSearch,pickerCursors:[undefined]})} hasPrevious={state.pickerCursors.length>1} hasNext={!!picker.data?.nextCursor} previous={()=>store.setState({pickerCursors:state.pickerCursors.slice(0,-1)})} next={()=>store.setState({pickerCursors:[...state.pickerCursors,picker.data?.nextCursor??undefined]})} close={()=>store.setState({picker:false})} choose={o=>store.setState({object:o.id,picker:false})}/>:null}
 {state.object?<RowEditor key={state.object} projectId={projectId} poolId={poolId} objectId={state.object} overrideOnly close={()=>store.setState({object:null})}/>:null}</section>;
}
