import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createApiClient,type ApiRequest,type AppError } from '../../shared/api/index.js';
import { SourceListResponse,SourceListItem,TestSourceResponse,DemoTemplateList,type NewSource } from '../../shared/api/source-schemas.js';
import { projectKeys } from '../tenancy/data.js';
const api=createApiClient();
async function request<T>(options:ApiRequest<T>){const result=await api.request(options);if(!result.ok)throw result.error;return result.value;}
async function pages<T>(path:string,schema:z.ZodType<{items:T[];nextCursor:string|null}>){const items:T[]=[];let cursor:string|null=null;do{const result:{items:T[];nextCursor:string|null}=await request({path:path+(cursor?`?cursor=${encodeURIComponent(cursor)}`:''),response:schema});items.push(...result.items);cursor=result.nextCursor;}while(cursor);return items;}
export const sourceKeys={detail:(p:string,id:string)=>[...projectKeys.scope(p),'dataSource','detail',id] as const,lists:(id:string)=>[...projectKeys.scope(id),'dataSource','list'] as const};
export const demoKeys={list:(industryId:string,projectId:string)=>['demoSourceTemplate',industryId,projectId] as const};
export function useSources(id:string){return useQuery<z.infer<typeof SourceListItem>[],AppError>({queryKey:sourceKeys.lists(id),queryFn:()=>pages(`/api/v1/projects/${id}/sources`,SourceListResponse),staleTime:60000,refetchInterval:query=>query.state.data?.some(source=>source.status==='pending'||source.status==='testing')?5000:false,retry:false});}
export function useDemos(projectId:string,industryId:string){return useQuery<z.infer<typeof DemoTemplateList>,AppError>({queryKey:demoKeys.list(industryId,projectId),enabled:!!industryId,queryFn:()=>request({path:`/api/v1/industries/${industryId}/demo-sources?projectId=${projectId}`,response:DemoTemplateList}),staleTime:3600000,retry:false});}
export function useTestSource(id:string){return useMutation<z.infer<typeof TestSourceResponse>,AppError,string>({mutationFn:credentialRef=>request({path:`/api/v1/projects/${id}/sources/test`,method:'POST',body:{kind:'postgres',credentialRef},response:TestSourceResponse})});}
export function useConnectSource(id:string,industryId:string){const cache=useQueryClient();return useMutation<z.infer<typeof SourceListItem>,AppError,NewSource|{demoTemplateId:string}>({mutationFn:body=>request({path:`/api/v1/projects/${id}/sources${'demoTemplateId'in body?'/from-demo':''}`,method:'POST',body,response:SourceListItem}),onSuccess:async(_value,input)=>{
 if('demoTemplateId'in input)cache.setQueryData<z.infer<typeof DemoTemplateList>>(demoKeys.list(industryId,id),old=>old?.map(item=>item.id===input.demoTemplateId?{...item,connected:true}:item));
 await Promise.all([cache.invalidateQueries({queryKey:sourceKeys.lists(id)}),cache.invalidateQueries({queryKey:projectKeys.stats(id)})]);
}});}

export function useRetrySource(projectId:string){const cache=useQueryClient();return useMutation<z.infer<typeof SourceListItem>,AppError,string>({mutationFn:id=>request({path:`/api/v1/sources/${id}/introspect`,method:'POST',body:{projectId},response:SourceListItem}),onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:sourceKeys.lists(projectId)}),cache.invalidateQueries({queryKey:projectKeys.stats(projectId)})]);}});}
