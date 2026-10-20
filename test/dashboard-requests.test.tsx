// @vitest-environment happy-dom
import {afterEach,it,expect,vi} from 'vitest';
import {renderHook,render,act,cleanup,waitFor,fireEvent,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useDashboardModel,dashboardKeys} from '../src/app/dashboard/data.js';
import {ActivityScreen} from '../src/app/activity/screens.js';
import {ActivityEntry} from '../src/shared/api/activity.js';
import {emptySpectrum} from '../src/app/dashboard/read-model.js';
import {projectStreamCache} from '../src/app/stream-cache.js';
const project='018f8f9d-7f83-7abc-8def-000000000001',pool='018f8f9d-7f83-7abc-8def-000000000002',run='018f8f9d-7f83-7abc-8def-000000000003';
const counts={all:1,refused:0,incomplete:1,answerTreated:0};
function fixture(){
 const paths:string[]=[],entry=ActivityEntry.parse({id:run,projectId:project,poolId:pool,agentId:'agent',keyPrefix:'prefix',mode:'query',startedAt:new Date().toISOString(),status:'incomplete',rowCount:null,latencyMs:null,synthetic:null,request:null,argumentVisibility:'hidden',versions:{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null}});
 const fetcher=vi.fn(async(input:string)=>{
  paths.push(input);const url=new URL(input,'http://localhost'),path=url.pathname;
  let body:unknown;
  if(path.endsWith('/stats'))body={asOf:new Date().toISOString(),utcDay:new Date().toISOString().slice(0,10),pools:1,sources:1,spectrum:emptySpectrum(),requests:1,queries:1,prompts:0,refused:0,incomplete:1,connectedAgents:0,staleAgents:0};
  else if(path.endsWith('/pools'))body={items:[{id:pool,name:'Pool',sourceIds:[],modeQuery:true,modePrompt:false,workingKeys:1,agents:0,activeAgents:0,clearElements:0,activeElements:0}],nextCursor:null};
  else if(path.endsWith('/entitlement-groups'))body={items:[],nextCursor:null,totals:{members:0,groups:0,undecided:0,decisions:[]}};
  else if(path.endsWith('/runs/summary'))body={counts,days:[{day:entry.startedAt.slice(0,10),counts,modes:{query:1,prompt:0},outcomes:{incomplete:1,answered:0,reduced:0,refused:0,clarify:0,failed:0}}]};
  else if(path.endsWith('/runs'))body={items:[entry],nextCursor:null};
  else if(path.startsWith('/api/v1/runs/'))return new Response(JSON.stringify({error:{code:'not_found',message:'Detail requested',requestId:'test',retryable:false}}),{status:404});
  else body={items:[],nextCursor:null,counts:{open:0,resolved:0},projectName:'Project'};
  return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 });
 vi.stubGlobal('fetch',fetcher);
 const cache=new QueryClient({defaultOptions:{queries:{retry:false}}}),wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={cache}>{children}</QueryClientProvider>;
 return {paths,cache,wrapper};
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('X-06: a cold Dashboard needs no per-run fetch; 30-second polls skip configuration, and Refresh reloads it',async()=>{
 vi.useFakeTimers();const {paths,cache,wrapper}=fixture();
 const hook=renderHook(()=>useDashboardModel(project,false),{wrapper});
 await act(async()=>{await vi.advanceTimersByTimeAsync(100);});expect(hook.result.current.isSuccess).toBe(true);
 expect(hook.result.current.data?.recent).toHaveLength(1);
 expect(hook.result.current.data?.pools[0]?.pool).toEqual({id:pool,name:'Pool'});
 expect(paths.filter(p=>p.includes('/runs/summary?'))).toHaveLength(1);
 expect(paths.some(p=>p.startsWith('/api/v1/runs/'))).toBe(false);
 paths.length=0;
 await act(async()=>{await vi.advanceTimersByTimeAsync(30_100);});
 expect(paths.some(p=>p.includes('/runs/summary?'))).toBe(true);
 expect(paths.filter(p=>p.includes('/agents?'))).toHaveLength(1);
 expect(paths.some(p=>/stats|entitlement-groups|\/projects\/[^/]+\/pools/.test(p))).toBe(false);
 paths.length=0;
 await act(async()=>{await hook.result.current.refetch();});
 expect(paths.filter(p=>p.includes('/entitlement-groups?'))).toHaveLength(2);
 paths.length=0;
 await act(async()=>{await vi.advanceTimersByTimeAsync(300_100);});
 expect(paths.filter(p=>p.includes('/entitlement-groups?'))).toHaveLength(2);
 paths.length=0;
 await act(async()=>{await cache.invalidateQueries({queryKey:dashboardKeys.stats(project)});});
 expect(paths.filter(p=>p.includes('/entitlement-groups?'))).toHaveLength(2);
 hook.unmount();cache.clear();
});
it('X-06: cold Activity renders list metadata; detail is fetched only on explicit expansion',async()=>{
 const {paths,cache,wrapper}=fixture();
 render(<ActivityScreen projectId={project} filters={{}} onFilters={()=>{}}/>,{wrapper});
 await screen.findByRole('button',{name:'Details'});
 expect(paths.some(p=>p.startsWith('/api/v1/runs/'))).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Details'}));
 await waitFor(()=>expect(paths.filter(p=>p.startsWith('/api/v1/runs/'))).toHaveLength(1));
 cleanup();cache.clear();
});
it('X-06: presence/progress bursts leave Dashboard to its poll; structural change and reconnect invalidate it',async()=>{
 vi.useFakeTimers();const cache=new QueryClient(),consumer=projectStreamCache(cache,project),key=dashboardKeys.configuration(project);
 cache.setQueryData(key,{});
 for(let sequence=1;sequence<=100;sequence++)consumer.receive({type:'agent.presence',poolId:pool,agentId:'agent',sequence});
 consumer.receive({type:'introspection.progress',sequence:101,sourceId:run,runId:run,state:'reading',objects:1,total:2});
 await vi.advanceTimersByTimeAsync(50);expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
 consumer.receive({type:'catalog.changed',sequence:102,sourceId:run});await vi.advanceTimersByTimeAsync(50);expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
 cache.setQueryData(key,{});consumer.receive({type:'snapshot',sequence:0,at:new Date().toISOString(),invalidate:['agentPresence']});await vi.advanceTimersByTimeAsync(50);expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
 consumer.dispose();cache.clear();
});
