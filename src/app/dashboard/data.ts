import {readDashboardModel} from './read-model.js';
import {useQuery,useInfiniteQuery} from '@tanstack/react-query';
import {dashboardStats,dashboardFeed,dashboardPools} from '../../shared/api/dashboard.js';
import {projectKeys} from '../tenancy/data.js';
export const dashboardKeys={overview:(p:string,admin:boolean)=>[...projectKeys.stats(p),'overview',admin] as const,stats:projectKeys.stats,feed:(p:string)=>[...projectKeys.stats(p),'feed'] as const,pools:(p:string)=>[...projectKeys.stats(p),'pools'] as const};
export function useDashboard(p:string){return useQuery({queryKey:dashboardKeys.stats(p),queryFn:async()=>{const r=await dashboardStats(p);if(!r.ok)throw r.error;return r.value;},retry:false,staleTime:0,refetchInterval:30000});}
export function useDashboardFeed(p:string){return useInfiniteQuery({queryKey:dashboardKeys.feed(p),initialPageParam:null as string|null,queryFn:async({pageParam})=>{const r=await dashboardFeed(p,pageParam);if(!r.ok)throw r.error;return r.value;},getNextPageParam:r=>r.nextCursor,retry:false,staleTime:0,refetchInterval:30000});}
export function useShields(p:string){return useInfiniteQuery({queryKey:dashboardKeys.pools(p),initialPageParam:null as string|null,queryFn:async({pageParam})=>{const r=await dashboardPools(p,pageParam);if(!r.ok)throw r.error;return r.value;},getNextPageParam:r=>r.nextCursor,retry:false,staleTime:0,refetchInterval:30000});}

export function useDashboardModel(p:string,admin:boolean){return useQuery({queryKey:dashboardKeys.overview(p,admin),queryFn:()=>readDashboardModel(p,admin),retry:false,staleTime:0,refetchInterval:30000});}
