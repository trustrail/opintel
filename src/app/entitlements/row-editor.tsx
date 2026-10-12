import {Timestamp} from '../settings/preferences.js';
import {useMemo} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import {useInfiniteQuery,useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {readRowHistory,readRowDecision,saveRowDecision} from '../../shared/api/row-entitlements.js';
import {Button,LoadingState,ErrorState} from '../../shared/ui/index.js';
import {entitlementKeys} from './data.js';
import {projectKeys} from '../tenancy/data.js';
import {activityKeys} from '../activity/data.js';
export function RowEditor({projectId,poolId,objectId,close}:{projectId:string;poolId:string;objectId:string;close:()=>void}){
 const cache=useQueryClient(),store=useMemo(()=>createStore<{historyOpen:boolean;draft:string|null;set:(draft:string)=>void}>(set=>({historyOpen:false,draft:null,set:draft=>set({draft})})),[objectId,poolId]),state=useStore(store);
 const query=useQuery({queryKey:entitlementKeys.row(projectId,poolId,objectId),queryFn:async()=>{const r=await readRowDecision(projectId,poolId,objectId);if(!r.ok)throw r.error;return r.value;},retry:false});
 const save=useMutation({mutationFn:async(expression:string)=>{const r=await saveRowDecision(poolId,objectId,{projectId,expression});if(!r.ok)throw r.error;return r.value;},onSuccess:async()=>{store.setState({draft:null});await Promise.all([entitlementKeys.all(projectId),projectKeys.stats(projectId),activityKeys.all(projectId)].map(queryKey=>cache.invalidateQueries({queryKey})));}});
 const history=useInfiniteQuery({queryKey:entitlementKeys.rowHistory(projectId,poolId,objectId),initialPageParam:undefined as string|undefined,queryFn:async({pageParam})=>{const r=await readRowHistory(projectId,poolId,objectId,pageParam);if(!r.ok)throw r.error;return r.value;},getNextPageParam:p=>p.nextCursor??undefined});
 const value=state.draft??query.data?.current?.expression??'',changed=value!==(query.data?.current?.expression??'');
 return <section className="card" aria-label="Row entitlement editor"><div className="card-h"><h2>Rows · {query.data?.objectName??'Object'}</h2><Button variant="ghost" onClick={close}>Close row editor</Button></div>
 {query.isPending?<LoadingState/>:query.isError?<ErrorState title="Row decision could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:<div className="pgbox">
 <p>{query.data.scoped?<span className="ichip">Rows scoped</span>:'Rows unscoped'}{query.data.scoped&&!query.data.current?' · No row decision for this pool; requests receive zero rows.':null}</p>
 <label htmlFor="row-expression">Row predicate for this object and pool</label><textarea id="row-expression" value={value} maxLength={8192} disabled={save.isPending} onChange={e=>state.set(e.target.value)} aria-describedby="row-predicate-help"/>
 <p className="note" id="row-predicate-help">Comparisons, IN, AND / OR / NOT, IS NULL and IS NOT NULL. Only true admits a row. NOT (status = 'closed') excludes null status. Scope references arrive in step 3.</p>
 <div className="interp" aria-label="Predicate columns">{query.data.columns.map(c=><span key={c.id} className="ichip"><b>{c.name}</b><span>{c.type}{c.type==='DATE'||c.type==='TIMESTAMP'?' · stored values, no zone conversion':c.type==='TIMESTAMPTZ'?' · instants, explicit zone':''}</span></span>)}</div>
 {query.data.columns.some(c=>c.type==='FLOAT'||c.type==='DOUBLE')?<p className="note">Floating-point equality is rarely intended. Comparisons use the exact represented value.</p>:null}
 {!query.data.scoped?<p className="note">The first decision scopes this object. Other pools without a row decision will receive zero rows.</p>:null}
 {query.data.current?<p className="note" style={{overflowWrap:'anywhere'}}>Decision {query.data.current.id} · {query.data.current.hash}</p>:null}
 {save.isError?<p role="alert">{save.error.message}</p>:null}{save.isSuccess&&!changed?<p role="status">Row decision saved.</p>:null}
 <button type="button" className="toolchip" aria-expanded={state.historyOpen} aria-controls="row-decision-history" onClick={()=>store.setState({historyOpen:!state.historyOpen})}>Decision history</button><div id="row-decision-history" hidden={!state.historyOpen}>{state.historyOpen?<>{history.isPending?<LoadingState/>:history.isError?<p role="alert">{history.error.message}</p>:history.data.pages.flatMap(p=>p.items).map(d=><div className="seg" key={d.id} style={{overflowWrap:'anywhere'}}><p>{d.expression}</p><p className="note">Decision {d.id} · {d.hash} · actor {d.actorId} · <Timestamp value={d.decidedAt}/></p></div>)}{history.hasNextPage?<Button variant="ghost" onClick={()=>history.fetchNextPage()}>More decisions</Button>:null}</>:null}</div>
 <div className="filters"><span>{changed?'One row decision will change.':'No unsaved changes.'}</span><Button disabled={!changed||!value.trim()||save.isPending} onClick={()=>save.mutate(value)}>{save.isPending?'Saving…':'Save row decision'}</Button></div>
 </div>}</section>;
}
