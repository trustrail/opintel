// @vitest-environment happy-dom
import {afterEach,it,expect,vi} from 'vitest';
import {renderHook,act,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {usePoolCommand,poolKeys,agentKeys} from '../src/app/pools/data.js';
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
