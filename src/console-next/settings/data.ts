import {z} from 'zod';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {createApiClient,type ApiRequest} from '../../shared/api/client.js';
import {ProjectSettingsView} from '../../shared/api/settings.js';
import {CustodyProviderStatus} from '../../shared/api/release-custody.js';
import {EnginePage} from '../../shared/api/engines.js';
import {ProjectMemberListResponse} from '../../shared/api/tenancy-schemas.js';
import {TokenKeyView} from '../../shared/custody-contract.js';
import {NeedsYouPage} from '../../shared/api/needs-you.js';
import {homeKeys,pages,read} from '../home/data.js';
export const Invitation=z.object({id:z.uuid(),email:z.email(),role:z.enum(['admin','operator','viewer']),status:z.enum(['pending','expired']),expiresAt:z.iso.datetime({offset:true}),createdAt:z.iso.datetime({offset:true})});
const Invitations=z.object({items:z.array(Invitation),nextCursor:z.string().nullable()});
export const settingsKeys={all:(p:string)=>[...homeKeys.scope(p),'settings'] as const,part:(p:string,k:string)=>[...settingsKeys.all(p),k] as const};
export function useSettings(project:string,admin:boolean){
 const base=`/api/v1/projects/${project}`,client=createApiClient();
 const settings=useQuery({queryKey:settingsKeys.part(project,'values'),queryFn:()=>read(client,base+'/settings',ProjectSettingsView)});
 const provider=useQuery({queryKey:settingsKeys.part(project,'provider'),queryFn:()=>read(client,base+'/custody-provider',CustodyProviderStatus),refetchInterval:15000});
 const engines=useQuery({queryKey:settingsKeys.part(project,'engines'),queryFn:async()=>(await pages(client,base+'/engines?limit=100',EnginePage,Infinity)).items.map(({id,name,address,certificatePin,custody,health,verifiedAt,lastSeenAt,sources})=>({id,name,address,certificatePin,custody,health,verifiedAt,lastSeenAt,sourceCount:sources.length})),refetchInterval:15000});
 const people=useQuery({queryKey:settingsKeys.part(project,'people'),queryFn:async()=>(await pages(client,base+'/members?limit=100',ProjectMemberListResponse,Infinity)).items});
 const invitations=useQuery({queryKey:settingsKeys.part(project,'invitations'),queryFn:async()=>(await pages(client,base+'/invitations?limit=100',Invitations,Infinity)).items});
 const token=useQuery({queryKey:settingsKeys.part(project,'token'),enabled:admin,queryFn:()=>read(client,base+'/token-key',TokenKeyView),refetchInterval:15000});
 const needs=useQuery({queryKey:settingsKeys.part(project,'needs'),queryFn:async()=>(await pages(client,base+'/needs-you?limit=100',NeedsYouPage,Infinity)).items});
 return {settings,provider,engines,people,invitations,token,needs};
}
export type SettingsData=ReturnType<typeof useSettings>;
export function useSettingsCommand(project:string){const cache=useQueryClient();return useMutation({mutationFn:async(request:ApiRequest<unknown>)=>{const r=await createApiClient().request(request);if(!r.ok)throw r.error;return r.value;},onSuccess:async(_result,request)=>{if(request.method==='DELETE'&&request.path.includes('/members/'))await cache.invalidateQueries({queryKey:homeKeys.projects()});await Promise.all([cache.invalidateQueries({queryKey:settingsKeys.all(project)}),cache.invalidateQueries({queryKey:homeKeys.health(project)}),cache.invalidateQueries({queryKey:homeKeys.facts(project)})]);}});}

/** One ordering for displayed rows, section dots and the Settings health band. */
export type Status='ok'|'unknown'|'warning'|'down';
export const worstStatus=(statuses:readonly Status[]):Status=>(['down','warning','unknown','ok'] as const).find(s=>statuses.includes(s))??'unknown';
export const localCustodyReason='development only, not real custody';
export const custodyTitle=(provider:'local'|'xq'|null|undefined)=>provider?`Custody · ${provider==='xq'?'XQ':'local'}`:'Custody';
export function custodyRowStatuses(provider:SettingsData['provider']['data']){
 return {provider:provider?.provider==='local'||!provider?.provider?'warning':'ok',connection:provider?.available?'ok':'warning',apiKey:provider?.apiKeySet?'ok':'warning',dashboard:provider?.dashboardCheck?.status==='authenticated'?'ok':'warning',signingKey:provider?.signingKeyId?'ok':'warning'} satisfies Record<string,Status>;
}
