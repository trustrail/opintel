import {useInfiniteQuery,useQuery} from '@tanstack/react-query';
import {activityList,activityDetail,type ActivityFilters} from '../../shared/api/activity.js';
import type {AppError} from '../../shared/api/index.js';
import type {EvidenceDetail} from '../../shared/api/activity.js';
import {projectKeys} from '../tenancy/data.js';
export const activityKeys={all:(p:string)=>[...projectKeys.scope(p),'activity'] as const,list:(p:string,f:ActivityFilters)=>[...activityKeys.all(p),'list',f] as const,detail:(p:string,id:string,at:string)=>[...activityKeys.all(p),'detail',id,at] as const};
export function useActivity(project:string,filters:ActivityFilters){return useInfiniteQuery({queryKey:activityKeys.list(project,filters),initialPageParam:null as string|null,queryFn:async({pageParam})=>{const result=await activityList(project,filters,pageParam);if(!result.ok)throw result.error;return result.value;},getNextPageParam:page=>page.nextCursor,retry:false,staleTime:0,gcTime:0});}
export function useEvidence(project:string,id:string,at:string){return useQuery<EvidenceDetail,AppError>({queryKey:activityKeys.detail(project,id,at),queryFn:async()=>{const result=await activityDetail(project,id,at);if(!result.ok)throw result.error;return result.value;},retry:false,staleTime:0,gcTime:0});}
