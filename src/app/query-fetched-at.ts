import type {QueryCache} from '@tanstack/react-query';
const tracked=new WeakSet<QueryCache>(),fetchedAt=new WeakMap<object,number>();
/** Fetch metadata only. An SSE partial patch or optimistic update is not a fetch. */
export function trackQueryFetchTimes(cache:QueryCache):void{
 if(tracked.has(cache))return;tracked.add(cache);
 // Existing hydrated query timestamps retain their recorded age.
 for(const query of cache.getAll())if(query.state.data!==undefined&&query.state.dataUpdatedAt>0)fetchedAt.set(query,query.state.dataUpdatedAt);
 cache.subscribe(event=>{
  if(event.type==='updated'&&event.action.type==='success'&&!event.action.manual)fetchedAt.set(event.query,event.query.state.dataUpdatedAt);
 });
}
export const queryFetchedAt=(query:object):number|undefined=>fetchedAt.get(query);
