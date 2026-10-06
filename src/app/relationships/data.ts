import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {SuggestionPage,DomainPage,AttemptPage,SuggestionAction} from '../../shared/api/suggestions.js';
import {settingsRequest} from '../settings/data.js';
import {projectKeys} from '../tenancy/data.js';
import {elementKeys} from '../catalog/data.js';
import {entitlementKeys} from '../entitlements/data.js';
import {suggestionKeys} from './keys.js';
export {suggestionKeys} from './keys.js';
async function pages<T>(project:string,path:string,response:z.ZodType<{items:T[];nextCursor:string|null}>):Promise<T[]>{
 const all:T[]=[];let cursor:string|null=null;do{const p:{items:T[];nextCursor:string|null}=await settingsRequest({path:`/api/v1/projects/${project}/suggestions${path}${cursor?'?cursor='+encodeURIComponent(cursor):''}`,response});all.push(...p.items);cursor=p.nextCursor;}while(cursor);return all;
}
export function useSuggestions(project:string){return useQuery({queryKey:suggestionKeys.list(project),queryFn:async()=>{const first=await settingsRequest({path:`/api/v1/projects/${project}/suggestions`,response:SuggestionPage});const items=[...first.items];let cursor=first.nextCursor;while(cursor){const p=await settingsRequest({path:`/api/v1/projects/${project}/suggestions?cursor=${cursor}`,response:SuggestionPage});items.push(...p.items);cursor=p.nextCursor;}return {...first,items};},retry:false,refetchInterval:30000});}
export function useDomains(project:string){return useQuery({queryKey:suggestionKeys.domains(project),queryFn:()=>pages(project,'/domains',DomainPage),retry:false});}
export function useAttempts(project:string,id:string){return useQuery({queryKey:suggestionKeys.attempts(project,id),queryFn:()=>pages(project,`/${id}/attempts`,AttemptPage),retry:false,staleTime:0,gcTime:0});}
export function useDecision(project:string,id:string){const cache=useQueryClient();return useMutation({mutationFn:(body:z.infer<typeof SuggestionAction>)=>settingsRequest({path:`/api/v1/projects/${project}/suggestions/${id}/decisions`,method:'POST',body,response:z.object({recorded:z.literal(true)})}),onSettled:async()=>{await Promise.all([suggestionKeys.all(project),elementKeys.lists(project),elementKeys.declarations(project),entitlementKeys.all(project),projectKeys.stats(project)].map(queryKey=>cache.invalidateQueries({queryKey})));}});}
