import {useMemo} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import {useInfiniteQuery} from '@tanstack/react-query';
import {readPoolRowObjects} from '../../shared/api/row-entitlements.js';
import {Button,LoadingState,ErrorState} from '../../shared/ui/index.js';
import {entitlementKeys} from '../entitlements/data.js';
import {RowEditor} from '../entitlements/row-editor.js';
export function PoolRowEntitlements({projectId,poolId}:{projectId:string;poolId:string}){
 const store=useMemo(()=>createStore<{object:string|null}>(()=>({object:null})),[poolId]),state=useStore(store);
 const query=useInfiniteQuery({queryKey:entitlementKeys.rowObjects(projectId,poolId),initialPageParam:undefined as string|undefined,queryFn:async({pageParam})=>{const r=await readPoolRowObjects(projectId,poolId,pageParam);if(!r.ok)throw r.error;return r.value;},getNextPageParam:p=>p.nextCursor??undefined});
 return <section className="seg" aria-label="Pool row entitlements"><h2>Row access</h2>{query.isPending?<LoadingState/>:query.isError?<ErrorState title="Row access could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:<>{!query.data.pages.some(p=>p.items.length)?<p>No bound objects.</p>:query.data.pages.flatMap(p=>p.items).map(o=><div className="frow" key={o.id}><span>{o.name} · {o.status==='missing'?'No effective filter — zero rows':o.status==='inherited'?'Inherits from object':o.status==='overridden'?'Pool override with inherited restrictions':'Unscoped'}</span><Button variant="ghost" onClick={()=>store.setState({object:o.id})}>Edit rows for {o.name}</Button></div>)}{query.hasNextPage?<Button variant="ghost" onClick={()=>query.fetchNextPage()}>More objects</Button>:null}</>}{state.object?<RowEditor projectId={projectId} poolId={poolId} objectId={state.object} close={()=>store.setState({object:null})}/>:null}</section>;
}
