import {create} from 'zustand';
export type PoolTab='access'|'credentials'|'agents';
const params=typeof window==='undefined'?new URLSearchParams():new URLSearchParams(window.location.search);
export const usePoolsState=create<{pool:string|null;tab:PoolTab;filter:string|null;createOpen:boolean;select:(pool:string|null)=>void;setTab:(tab:PoolTab)=>void;setFilter:(filter:string|null)=>void;setCreateOpen:(open:boolean)=>void}>(set=>({
 pool:params.get('pool'),tab:params.get('tab')==='agents'?'agents':params.get('tab')==='credentials'?'credentials':'access',filter:null,createOpen:false,
 select:pool=>{set({pool,filter:null});const url=new URL(window.location.href);if(pool)url.searchParams.set('pool',pool);else url.searchParams.delete('pool');window.history.replaceState(null,'',url);},
 setTab:tab=>set({tab,filter:null}),setFilter:filter=>set({filter}),setCreateOpen:createOpen=>set({createOpen}),
}));
