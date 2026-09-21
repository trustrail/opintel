import { useInfiniteQuery,useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { createApiClient,type ApiRequest,type AppError } from '../../shared/api/index.js';
import { IntrospectionRunView,IntrospectionRunList,type RunView } from '../../shared/api/introspection.js';
import { projectKeys } from '../tenancy/data.js';
import { sourceKeys } from '../sources/data.js';
const api=createApiClient();
async function request<T>(options:ApiRequest<T>){const result=await api.request(options);if(!result.ok)throw result.error;return result.value;}
export const introspectionKeys={all:(p:string)=>[...projectKeys.scope(p),'introspection'] as const,lists:(p:string)=>[...introspectionKeys.all(p),'list'] as const,list:(p:string,s:string)=>[...introspectionKeys.lists(p),s] as const,detail:(p:string,r:string)=>[...introspectionKeys.all(p),'detail',r] as const};
export const active=(state:RunView['state'])=>['queued','connecting','reading','diffing'].includes(state);
export function useIntrospections(project:string,source:string){return useInfiniteQuery({queryKey:introspectionKeys.list(project,source),initialPageParam:null as string|null,queryFn:({pageParam})=>request({path:`/api/v1/projects/${project}/sources/${source}/introspections${pageParam?`?cursor=${encodeURIComponent(pageParam)}`:''}`,response:IntrospectionRunList}),getNextPageParam:page=>page.nextCursor,staleTime:5000,retry:false});}
export function useIntrospection(project:string,id:string){return useQuery<RunView,AppError>({queryKey:introspectionKeys.detail(project,id),queryFn:()=>request({path:`/api/v1/projects/${project}/introspections/${id}`,response:IntrospectionRunView}),staleTime:5000,retry:false});}
export function useCancelIntrospection(project:string,id:string){const cache=useQueryClient();return useMutation<RunView,AppError,void>({mutationFn:()=>request({path:`/api/v1/projects/${project}/introspections/${id}/cancel`,method:'POST',body:{},response:IntrospectionRunView}),onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:introspectionKeys.detail(project,id)}),cache.invalidateQueries({queryKey:introspectionKeys.lists(project)}),cache.invalidateQueries({queryKey:sourceKeys.lists(project)})]);}});}
