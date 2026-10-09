import {sourceKeys} from '../sources/data.js';
import {elementKeys} from '../catalog/data.js';
import {useInfiniteQuery,useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {createApiClient,type AppError} from '../../shared/api/index.js';
import {PoolPage,readPool,readTwin} from '../../shared/api/pools.js';
import {listPoolAgents} from '../../shared/api/agent-presence.js';
import {createPool,rotatePoolKey,revokePoolKey,affectedPoolKeyAgents,type PoolKeyCreationResponse} from '../../shared/api/pool-keys.js';
import {projectKeys} from '../tenancy/data.js';
import {poolKeys,agentKeys} from './keys.js';
export {poolKeys,agentKeys} from './keys.js';
export function usePoolList(p:string){return useInfiniteQuery({queryKey:poolKeys.overview(p),initialPageParam:null as string|null,queryFn:async({pageParam})=>{const r=await createApiClient().request({path:`/api/v1/projects/${p}/pools${pageParam?'?cursor='+encodeURIComponent(pageParam):''}`,response:PoolPage});if(!r.ok)throw r.error;return r.value;},getNextPageParam:r=>r.nextCursor,retry:false,staleTime:60000});}
export function usePool(p:string,id:string,enabled=true){return useQuery({queryKey:poolKeys.detail(p,id),queryFn:async()=>{const r=await readPool(p,id);if(!r.ok)throw r.error;return r.value;},enabled:enabled&&Boolean(p&&id),retry:false,staleTime:60000});}
export function useAgents(p:string,id:string){return useInfiniteQuery({queryKey:agentKeys.list(p,id),initialPageParam:undefined as string|undefined,queryFn:async({pageParam})=>{const r=await listPoolAgents(id,p,pageParam);if(!r.ok)throw r.error;return r.value;},getNextPageParam:r=>r.nextCursor??undefined,retry:false,staleTime:Infinity});}
export function useTwin(p:string,id:string,agent:string){return useQuery({queryKey:agentKeys.twin(p,id,agent),queryFn:async()=>{const r=await readTwin(p,id,agent);if(!r.ok)throw r.error;return r.value;},retry:false,staleTime:Infinity});}
export function useImpact(p:string,id:string,key:string){return useQuery({queryKey:poolKeys.impact(p,id,key),queryFn:async()=>{const r=await affectedPoolKeyAgents(id,key,p);if(!r.ok)throw r.error;return r.value;},enabled:Boolean(key),retry:false,staleTime:0,gcTime:0});}
type Command={kind:'create';name:string;requestKey:string}|{kind:'rotate';requestKey:string}|{kind:'revoke';keyVersion:string;confirmation:string;requestKey:string};
export function usePoolCommand(p:string,id:string,onIssued:(r:PoolKeyCreationResponse)=>void){const cache=useQueryClient();return useMutation<void,AppError,Command>({retry:false,gcTime:0,mutationFn:async c=>{
 const r=c.kind==='create'?await createPool(p,{name:c.name},c.requestKey):c.kind==='rotate'?await rotatePoolKey(id,{projectId:p},c.requestKey):await revokePoolKey(id,{projectId:p,keyVersion:c.keyVersion,confirmation:c.confirmation},c.requestKey);
 if(!r.ok)throw r.error;
 // Never return the credential into TanStack's mutation cache.
 if(c.kind!=='revoke')onIssued(r.value);
 },onSuccess:async(_data,c)=>{const keys=c.kind==='create'?[poolKeys.lists(p),projectKeys.stats(p),sourceKeys.lists(p),elementKeys.lists(p)]:c.kind==='rotate'?[poolKeys.detail(p,id)]:[poolKeys.detail(p,id),poolKeys.lists(p),agentKeys.presence(p)];await Promise.all(keys.map(queryKey=>cache.invalidateQueries({queryKey})));}});}
