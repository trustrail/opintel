// @vitest-environment happy-dom
import {afterEach,it,expect,vi} from 'vitest';
import {renderHook,act,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {usePoolCommand,usePool,usePoolList,useAgents,useTwin,poolKeys,agentKeys} from '../src/app/pools/data.js';
import {sourceKeys} from '../src/app/sources/data.js';
import {elementKeys} from '../src/app/catalog/data.js';
import {projectKeys} from '../src/app/tenancy/data.js';
import {projectStreamCache} from '../src/app/stream-cache.js';
const p='018f8f9d-7f83-7abc-8def-000000000001',id='018f8f9d-7f83-7abc-8def-000000000002',version='018f8f9d-7f83-7abc-8def-000000000003',secret='opk_live_1234567890123456789012';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('I-001: creation delivers plaintext only to the shown-once UI, never the mutation cache',async()=>{
 const cache=new QueryClient(),received=vi.fn(),invalidations=vi.spyOn(cache,'invalidateQueries');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({poolId:id,keyVersion:version,prefix:'opk_live_12345678',createdAt:new Date().toISOString(),state:'current',graceUntil:null,keyShown:true,key:secret}),{status:200,headers:{'content-type':'application/json'}})));
 const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={cache}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>usePoolCommand(p,id,received),{wrapper});await act(async()=>{await hook.result.current.mutateAsync({kind:'create',name:'Reporting',requestKey:'create'});});
 expect(received).toHaveBeenCalledWith(expect.objectContaining({key:secret}));expect(JSON.stringify(cache.getMutationCache().getAll().map(m=>m.state))).not.toContain(secret);
 expect(invalidations.mock.calls.map(([o])=>o?.queryKey)).toEqual([poolKeys.lists(p),projectKeys.stats(p),sourceKeys.lists(p),elementKeys.lists(p)]);cache.clear();
});
it('rotation invalidates detail only; revocation invalidates detail, lists and presence',async()=>{
 const cache=new QueryClient(),invalidations=vi.spyOn(cache,'invalidateQueries');
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>new Response(JSON.stringify({poolId:id,keyVersion:version,prefix:'opk_live_12345678',createdAt:new Date().toISOString(),state:input.endsWith('/rotate')?'current':'revoked',graceUntil:null,keyShown:false,...(input.endsWith('/revoke')?{affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]}:{})}),{status:200,headers:{'content-type':'application/json'}})));
 const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={cache}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>usePoolCommand(p,id,()=>{}),{wrapper});await act(async()=>{await hook.result.current.mutateAsync({kind:'rotate',requestKey:'rotate'});});
 expect(invalidations.mock.calls.map(([o])=>o?.queryKey)).toEqual([poolKeys.detail(p,id)]);invalidations.mockClear();
 await act(async()=>{await hook.result.current.mutateAsync({kind:'revoke',keyVersion:version,confirmation:'Reporting',requestKey:'revoke'});});
 expect(invalidations.mock.calls.map(([o])=>o?.queryKey)).toEqual([poolKeys.detail(p,id),poolKeys.lists(p),agentKeys.presence(p)]);cache.clear();
});
it('I-018/020: presence notifications and reconnect snapshots invalidate retained twins without polling',async()=>{
 vi.useFakeTimers();const cache=new QueryClient(),consumer=projectStreamCache(cache,p),key=agentKeys.twin(p,id,'reporter');cache.setQueryData(key,{state:'disconnected'});const invalidations=vi.spyOn(cache,'invalidateQueries');
 consumer.receive({type:'agent.presence',poolId:id,agentId:'reporter',sequence:1});await vi.advanceTimersByTimeAsync(50);expect(cache.getQueryState(key)?.isInvalidated).toBe(true);expect(invalidations.mock.calls.map(([o])=>o?.queryKey)).toContainEqual(agentKeys.pool(p,id));
 invalidations.mockClear();consumer.receive({type:'snapshot',at:new Date().toISOString(),sequence:0,invalidate:['agentPresence']});await vi.advanceTimersByTimeAsync(50);expect(invalidations.mock.calls.map(([o])=>o?.queryKey)).toContainEqual(agentKeys.presence(p));expect(invalidations.mock.calls.map(([o])=>o?.queryKey)).toContainEqual(poolKeys.details(p));consumer.dispose();cache.clear();
});

it('X-06: remote credential/key revocation refreshes status without local mutation or SSE',async()=>{
 vi.useFakeTimers();const cache=new QueryClient();let revoked=false;
 const at=new Date().toISOString(),credential={id:version,label:'Reporting',custodyAlias:'agent:reporting',lastUse:null};
 const summary={id,name:'Reporting',sourceIds:[],modeQuery:true,modePrompt:false,workingKeys:1,agents:1,activeAgents:1,clearElements:0,activeElements:0};
 const presence={poolId:id,authenticatedWith:{kind:'credential',label:'Reporting',alias:'agent:reporting'},agentId:'reporter',client:null,verified:false,keyVersion:version,firstSeen:at,lastSeen:at,lastRequestAt:at,lastHeartbeatAt:at,staleAt:null,reconnects:0,state:'active'};
 const metadata={poolId:id,keyVersion:version,prefix:'opk_live_12345678',createdAt:at,state:'current',graceUntil:null};
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const path=new URL(input,'http://localhost').pathname;
  const current={...summary,workingKeys:revoked?0:1};
  const key={...metadata,state:revoked?'revoked':'current'};
  const body=path.endsWith('/pools')?{items:[current],nextCursor:null}:path.endsWith('/agents')?{items:[presence],nextCursor:null}:path.endsWith('/agents/reporter')?{presence,keyMetadata:key}:{...current,keys:[key],credentials:[{...credential,state:revoked?'revoked':'active'}],graceSeconds:3600};
  return new Response(JSON.stringify(body),{status:200});
 }));
 const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={cache}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>({pool:usePool(p,id),list:usePoolList(p),agents:useAgents(p,id),twin:useTwin(p,id,'reporter')}),{wrapper});
 await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
 expect(hook.result.current.pool.data?.credentials?.[0]?.state).toBe('active');
 expect(hook.result.current.twin.data?.keyMetadata.state).toBe('current');
 revoked=true;
 await act(async()=>{await vi.advanceTimersByTimeAsync(30_100);});
 expect(hook.result.current.pool.data?.credentials?.[0]?.state).toBe('revoked');
 expect(hook.result.current.pool.data?.keys[0]?.state).toBe('revoked');
 expect(hook.result.current.list.data?.pages[0]?.items[0]?.workingKeys).toBe(0);
 expect(hook.result.current.twin.data?.keyMetadata.state).toBe('revoked');
 // Presence is an observed fact, independent of whether its last key remains usable.
 expect(hook.result.current.agents.data?.pages[0]?.items[0]?.state).toBe('active');
 hook.unmount();cache.clear();
});
