// @vitest-environment happy-dom
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {QueryClient,QueryClientProvider,QueryObserver} from '@tanstack/react-query';
import {DataFreshness} from '../src/app/freshness.js';
import {dashboardKeys} from '../src/app/dashboard/data.js';
const project='project',old='2026-10-20T01:00:00.000Z',newer='2026-10-20T01:04:00.000Z';
afterEach(cleanup);
it('X-05: live Dashboard polls do not advance the five-minute collection fetch time',()=>{
 const cache=new QueryClient(),key=dashboardKeys.overview(project,true);
 cache.setQueryData(dashboardKeys.configuration(project),{asOf:old});cache.setQueryData(key,{}, {updatedAt:Date.parse(newer)});
 const observer=new QueryObserver(cache,{queryKey:key,staleTime:Infinity}),stop=observer.subscribe(()=>{});
 render(<QueryClientProvider client={cache}><DataFreshness projectId={project}/></QueryClientProvider>);
 expect(screen.getByRole('status').querySelector('time')?.getAttribute('datetime')).toBe(old);
 act(()=>{cache.setQueryData(key,{}, {updatedAt:Date.parse(newer)+30000});});
 expect(screen.getByRole('status').querySelector('time')?.getAttribute('datetime')).toBe(old);
 stop();cleanup();cache.clear();
});
it('X-05: refresh in flight remains visible; failure preserves the last successful fetch time',async()=>{
 const cache=new QueryClient(),key=['project',project,'sources'],failures:((error:Error)=>void)[]=[];
 cache.setQueryData(key,[],{updatedAt:Date.parse(old)});
 const observer=new QueryObserver(cache,{queryKey:key,staleTime:Infinity,retry:false,queryFn:()=>new Promise<never>((_resolve,reject)=>{failures.push(reject);})}),stop=observer.subscribe(()=>{});
 render(<QueryClientProvider client={cache}><DataFreshness projectId={project}/></QueryClientProvider>);
 let pending:ReturnType<typeof observer.refetch>;
 act(()=>{pending=observer.refetch();});
 expect(screen.getByRole('status').textContent).toContain('Refreshing…');
 expect(screen.getByRole('status').querySelector('time')?.getAttribute('datetime')).toBe(old);
 await act(async()=>{failures[0]!(new Error('Unavailable'));await pending;});
 expect(screen.getByRole('status').textContent).toContain('Refresh failed');
 expect(screen.getByRole('status').querySelector('time')?.getAttribute('datetime')).toBe(old);
 stop();cleanup();cache.clear();
});
it('X-05: initial fetch has no invented timestamp; inactive and other-project caches are excluded',()=>{
 const cache=new QueryClient(),key=['project',project,'sources'];
 cache.setQueryData(['project','other','sources'],[],{updatedAt:Date.parse(old)});
 cache.setQueryData(['project',project,'hidden'],[],{updatedAt:Date.parse(old)});
 const observer=new QueryObserver(cache,{queryKey:key,retry:false,queryFn:()=>new Promise<never>(()=>{})}),stop=observer.subscribe(()=>{});
 render(<QueryClientProvider client={cache}><DataFreshness projectId={project}/></QueryClientProvider>);
 expect(screen.getByRole('status').textContent).toBe('Fetching data…');expect(screen.getByRole('status').querySelector('time')).toBeNull();
 stop();cleanup();cache.clear();
});

it('X-05: partial stream/optimistic cache updates do not claim a new fetch time',()=>{
 const cache=new QueryClient(),key=['project',project,'sources'];cache.setQueryData(key,[],{updatedAt:Date.parse(old)});
 const observer=new QueryObserver(cache,{queryKey:key,staleTime:Infinity}),stop=observer.subscribe(()=>{});
 render(<QueryClientProvider client={cache}><DataFreshness projectId={project}/></QueryClientProvider>);
 act(()=>{cache.setQueryData(key,[{progress:1}],{updatedAt:Date.parse(newer)});});
 expect(screen.getByRole('status').querySelector('time')?.getAttribute('datetime')).toBe(old);
 stop();cleanup();cache.clear();
});

it('X-05: a successful network refresh advances the recorded fetch time',async()=>{
 const cache=new QueryClient(),key=['project',project,'sources'];cache.setQueryData(key,[],{updatedAt:Date.parse(old)});
 const observer=new QueryObserver(cache,{queryKey:key,staleTime:Infinity,queryFn:async()=>[]}),stop=observer.subscribe(()=>{});
 render(<QueryClientProvider client={cache}><DataFreshness projectId={project}/></QueryClientProvider>);
 await act(async()=>{await observer.refetch();});
 expect(screen.getByRole('status').querySelector('time')?.getAttribute('datetime')).toBe(new Date(observer.getCurrentResult().dataUpdatedAt).toISOString());
 expect(screen.getByRole('status').querySelector('time')?.getAttribute('datetime')).not.toBe(old);
 stop();cleanup();cache.clear();
});
