import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {EnginePage,EngineMutationResponse,type EngineView} from '../../shared/api/engines.js';
import {settingsRequest} from '../settings/data.js';
import {projectKeys} from '../tenancy/data.js';
import {sourceKeys} from '../sources/data.js';
import {custodyKeys} from '../custody/data.js';
export const engineKeys={list:(id:string)=>[...projectKeys.scope(id),'engines','list'] as const};
export function useEngines(project:string){return useQuery({queryKey:engineKeys.list(project),queryFn:async()=>{const all:EngineView[]=[];let cursor:string|null=null;do{const p:{items:EngineView[];nextCursor:string|null}=await settingsRequest({path:`/api/v1/projects/${project}/engines${cursor?'?cursor='+cursor:''}`,response:EnginePage});all.push(...p.items);cursor=p.nextCursor;}while(cursor);return all;},retry:false,refetchInterval:30000});}
export function useEngineAction(project:string){const cache=useQueryClient();return useMutation({mutationFn:(input:{path:string;method?:'POST'|'PATCH';body:Record<string,string>})=>settingsRequest({path:`/api/v1/projects/${project}/${input.path}`,method:input.method??'POST',body:input.body,response:EngineMutationResponse}),onSettled:async()=>{await Promise.all([engineKeys.list(project),sourceKeys.lists(project),projectKeys.stats(project),custodyKeys.status(project)].map(queryKey=>cache.invalidateQueries({queryKey})));}});}
