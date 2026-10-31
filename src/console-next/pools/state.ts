import {create} from 'zustand';
import {poolTabs} from '../routing.js';
export type PoolTab=typeof poolTabs[number];
const params=typeof window==='undefined'?new URLSearchParams():new URLSearchParams(window.location.search);
export const usePoolsState=create<{agent:string|null;setAgent:(agent:string|null)=>void;pool:string|null;tab:PoolTab;filter:string|null;createOpen:boolean;select:(pool:string|null)=>void;setTab:(tab:PoolTab)=>void;setFilter:(filter:string|null)=>void;setCreateOpen:(open:boolean)=>void}>(set=>({
 agent:params.get('agent'),setAgent:agent=>{set({agent});const u=new URL(location.href);if(agent)u.searchParams.set('agent',agent);else u.searchParams.delete('agent');history.replaceState(null,'',u);},pool:params.get('pool'),tab:poolTabs.find(t=>t===params.get('tab'))??'access',filter:params.get('rowFilter')==='unscoped'?'rows_missing':null,createOpen:params.get('create')==='true',
 select:pool=>{set({pool,filter:null,agent:null});const url=new URL(window.location.href);if(pool)url.searchParams.set('pool',pool);else url.searchParams.delete('pool');window.history.replaceState(null,'',url);},
 setTab:tab=>set({tab,filter:null}),setFilter:filter=>set({filter}),setCreateOpen:createOpen=>set({createOpen}),
}));
