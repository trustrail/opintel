import {useInfiniteQuery,useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {type AppError as ReleaseError} from '../../shared/api/client.js';
import {revokeRelease} from '../../shared/api/release-custody.js';
import {activityList,activityDetail,activitySummary,type ActivityFilters} from '../../shared/api/activity.js';
import type {AppError} from '../../shared/api/index.js';
import type {EvidenceDetail} from '../../shared/api/activity.js';
import {projectKeys} from '../tenancy/data.js';
export const activityKeys={page:(p:string,f:ActivityFilters,cursor?:string)=>[...activityKeys.list(p,f),'page',cursor] as const,all:(p:string)=>[...projectKeys.scope(p),'activity'] as const,list:(p:string,f:ActivityFilters)=>[...activityKeys.all(p),'list',f] as const,summaries:(p:string)=>[...activityKeys.all(p),'summary'] as const,summary:(p:string,f:ActivityFilters)=>[...activityKeys.summaries(p),f] as const,detail:(p:string,id:string,at:string)=>[...activityKeys.all(p),'detail',id,at] as const};
export function useActivity(project:string,filters:ActivityFilters){return useInfiniteQuery({queryKey:activityKeys.list(project,filters),initialPageParam:null as string|null,queryFn:async({pageParam})=>{const result=await activityList(project,filters,pageParam);if(!result.ok)throw result.error;return result.value;},getNextPageParam:page=>page.nextCursor,retry:false,staleTime:0,gcTime:0});}
export function useEvidence(project:string,id:string,at:string){return useQuery<EvidenceDetail,AppError>({queryKey:activityKeys.detail(project,id,at),queryFn:async()=>{const result=await activityDetail(project,id,at);if(!result.ok)throw result.error;return result.value;},retry:false,staleTime:0,gcTime:0});}
export function useActivitySummary(project:string,filters:ActivityFilters){return useQuery({queryKey:activityKeys.summary(project,filters),queryFn:async()=>{const result=await activitySummary(project,filters);if(!result.ok)throw result.error;return result.value;},retry:false,staleTime:0,gcTime:0});}

export function useReleaseRevocation(project:string,receipt:string,at:string){const query=useQueryClient();return useMutation<{revoked:true},ReleaseError,string>({mutationFn:async id=>{const result=await revokeRelease(project,id);if(!result.ok)throw result.error;return result.value;},onSuccess:async()=>{await query.invalidateQueries({queryKey:activityKeys.detail(project,receipt,at)});await query.invalidateQueries({queryKey:activityKeys.summaries(project)});}});}
