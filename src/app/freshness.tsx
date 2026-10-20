import {trackQueryFetchTimes,queryFetchedAt} from './query-fetched-at.js';
import {useCallback,useSyncExternalStore} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Timestamp} from './settings/preferences.js';
import {dashboardKeys} from './dashboard/data.js';
/** Oldest displayed query, never advanced by starting or failing a refresh. */
export function DataFreshness({projectId}:{projectId:string|null}){
 const cache=useQueryClient().getQueryCache();trackQueryFetchTimes(cache);
 const subscribe=useCallback((notify:()=>void)=>cache.subscribe(notify),[cache]);
 const snapshot=useCallback(()=>{
  const active=cache.getAll().filter(q=>q.getObserversCount()>0&&!q.isDisabled()&&(projectId?q.queryKey[0]==='project'&&q.queryKey[1]===projectId:q.queryKey[0]!=='auth'));
  const times=active.filter(q=>q.state.data!==undefined).map(queryFetchedAt).filter((at):at is number=>at!==undefined);
  if(projectId&&active.some(q=>q.queryKey[2]==='stats'&&q.queryKey[3]==='overview')){
   const configuration=cache.find({queryKey:dashboardKeys.configuration(projectId),exact:true});
   const value:unknown=configuration?.state.data;
   if(value&&typeof value==='object'&&'asOf' in value&&typeof value.asOf==='string'&&Number.isFinite(Date.parse(value.asOf)))times.push(Date.parse(value.asOf));
  }
  return JSON.stringify({at:times.length?Math.min(...times):null,fetching:active.some(q=>q.state.fetchStatus==='fetching'),failed:active.some(q=>q.state.status==='error')});
 },[cache,projectId]);
 const raw=useSyncExternalStore(subscribe,snapshot,snapshot);
 const state=JSON.parse(raw) as {at:number|null;fetching:boolean;failed:boolean};
 return <p className="note" role="status" aria-live="polite" aria-atomic="true">{state.at===null?(state.fetching?'Fetching data…':'Data has not been fetched yet.'):<>Oldest data fetched at <Timestamp value={new Date(state.at).toISOString()}/>.{state.fetching?' Refreshing…':state.failed?' Refresh failed; the fetch time has not advanced.':' This view refreshes periodically.'}</>}</p>;
}
