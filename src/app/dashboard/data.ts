import {readDashboardModel,readDashboardConfiguration} from './read-model.js';
import {useQuery,useInfiniteQuery,useQueryClient} from '@tanstack/react-query';
import {dashboardStats,dashboardFeed,dashboardPools} from '../../shared/api/dashboard.js';
import {projectKeys} from '../tenancy/data.js';
export const dashboardKeys={configuration:(p:string)=>[...projectKeys.stats(p),'configuration'] as const,overview:(p:string,admin:boolean)=>[...projectKeys.stats(p),'overview',admin] as const,stats:projectKeys.stats,feed:(p:string)=>[...projectKeys.stats(p),'feed'] as const,pools:(p:string)=>[...projectKeys.stats(p),'pools'] as const};
export function useDashboard(p:string){return useQuery({queryKey:dashboardKeys.stats(p),queryFn:async()=>{const r=await dashboardStats(p);if(!r.ok)throw r.error;return r.value;},retry:false,staleTime:0,refetchInterval:30000});}
export function useDashboardFeed(p:string){return useInfiniteQuery({queryKey:dashboardKeys.feed(p),initialPageParam:null as string|null,queryFn:async({pageParam})=>{const r=await dashboardFeed(p,pageParam);if(!r.ok)throw r.error;return r.value;},getNextPageParam:r=>r.nextCursor,retry:false,staleTime:0,refetchInterval:30000});}
export function useShields(p:string){return useInfiniteQuery({queryKey:dashboardKeys.pools(p),initialPageParam:null as string|null,queryFn:async({pageParam})=>{const r=await dashboardPools(p,pageParam);if(!r.ok)throw r.error;return r.value;},getNextPageParam:r=>r.nextCursor,retry:false,staleTime:0,refetchInterval:30000});}

export function useDashboardModel(p:string,admin:boolean){
 const cache=useQueryClient();
 const query=useQuery({queryKey:dashboardKeys.overview(p,admin),queryFn:()=>readDashboardModel(p,admin,undefined,()=>cache.fetchQuery({queryKey:dashboardKeys.configuration(p),queryFn:()=>readDashboardConfiguration(p),staleTime:300_000,retry:false})),retry:false,staleTime:0,refetchInterval:30000});
 return {...query,refetch:async()=>{
  await cache.invalidateQueries({queryKey:dashboardKeys.configuration(p),refetchType:'none'});
  return query.refetch();
 }};
}
