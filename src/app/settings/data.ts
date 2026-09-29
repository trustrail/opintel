import {activityKeys} from '../activity/data.js';
import {poolKeys,agentKeys} from '../pools/keys.js';
import {entitlementKeys} from '../entitlements/data.js';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {createApiClient,type ApiRequest} from '../../shared/api/client.js';
import {ProjectSettingsView,CompanySettingsView,PersonalSettingsView} from '../../shared/api/settings.js';
import {projectKeys,companyKeys} from '../tenancy/data.js';
import {authKeys} from '../guard.js';
export const settingsKeys={project:(p:string)=>[...projectKeys.scope(p),'settings'] as const,company:(c:string)=>['company',c,'settings'] as const,personal:()=>['user','settings'] as const};
const api=createApiClient();
export async function settingsRequest<T>(r:ApiRequest<T>){const result=await api.request(r);if(!result.ok)throw result.error;return result.value;}
export function useProjectSettings(id:string){return useQuery({queryKey:settingsKeys.project(id),queryFn:()=>settingsRequest({path:`/api/v1/projects/${id}/settings`,response:ProjectSettingsView}),retry:false});}
export function useCompanySettings(id:string){return useQuery({queryKey:settingsKeys.company(id),queryFn:()=>settingsRequest({path:`/api/v1/companies/${id}/settings`,response:CompanySettingsView}),retry:false,enabled:Boolean(id)});}
export function usePersonalSettings(){return useQuery({queryKey:settingsKeys.personal(),queryFn:()=>settingsRequest({path:'/api/v1/me/settings',response:PersonalSettingsView}),retry:false});}
export function useSaveSettings<T>(kind:'project'|'company'|'personal',id:string,schema:z.ZodType<T>){const cache=useQueryClient();return useMutation({mutationFn:(body:Record<string,import('../../shared/kernel/index.js').JsonValue>)=>settingsRequest({path:kind==='personal'?'/api/v1/me/settings':`/api/v1/${kind==='project'?'projects':'companies'}/${id}/settings`,method:'PATCH',body,response:schema}),onSuccess:async(_result,body)=>{
 const keys=kind==='project'?[settingsKeys.project(id),projectKeys.detail(id),projectKeys.stats(id)]:kind==='company'?[settingsKeys.company(id),companyKeys.lists(),projectKeys.lists(),authKeys.currentUser()]:[settingsKeys.personal(),authKeys.currentUser()];
 const related:readonly (readonly unknown[])[]=kind!=='project'?[]:[...(body.evidence?[activityKeys.all(id)]:[]),...(body.query?[entitlementKeys.all(id)]:[]),...(body.agentHeartbeatSeconds!==undefined||body.agentDisconnectGraceSeconds!==undefined?[agentKeys.presence(id),poolKeys.lists(id),poolKeys.details(id)]:body.poolKeyGraceSeconds!==undefined?[poolKeys.details(id)]:[])];
 await Promise.all([...keys,...related].map(queryKey=>cache.invalidateQueries({queryKey}))); 
 }});}
