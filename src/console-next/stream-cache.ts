import type {QueryClient,InfiniteData} from '@tanstack/react-query';
import {streamEventSchema} from '../shared/api/stream.js';
import type {RunView} from '../shared/api/introspection.js';
import {homeKeys} from './home/data.js';
import {sourceKeys,running} from './data/source-data.js';
/** Progress patches existing scan caches only. Structural events coalesce project
 * invalidation; a reconnect snapshot refreshes facts without replaying evidence. */
export function projectStreamCache(cache:QueryClient,project:string){
 let sequence=-1,disposed=false,timer:ReturnType<typeof setTimeout>|undefined,projectsDirty=false;
 const refresh=()=>{timer??=setTimeout(()=>{timer=undefined;void cache.invalidateQueries({queryKey:homeKeys.scope(project)});if(projectsDirty){projectsDirty=false;void cache.invalidateQueries({queryKey:homeKeys.projects()});}},50);};
 return {refresh,receive(raw:unknown){
  if(disposed)return;const parsed=streamEventSchema.safeParse(raw);if(!parsed.success)return;const event=parsed.data;
  if(event.type==='snapshot'){sequence=event.sequence;refresh();return;}
  if(event.sequence<=sequence)return;sequence=event.sequence;
  if(event.type==='introspection.progress'){
   const update=(run:RunView):RunView=>run.id===event.runId&&running(run.state)?{...run,state:event.state,progress:{objects:event.objects,total:event.total}}:run;
   cache.setQueryData<RunView>(sourceKeys.scan(project,event.runId),run=>run?update(run):undefined);
   cache.setQueriesData<InfiniteData<{items:RunView[];nextCursor:string|null}>>({queryKey:sourceKeys.scans(project,event.sourceId)},data=>data?{...data,pages:data.pages.map(page=>({...page,items:page.items.map(update)}))}:undefined);
  }else {if(event.type==='run.completed')projectsDirty=true;refresh();}
 },dispose(){disposed=true;if(timer)clearTimeout(timer);}};
}
