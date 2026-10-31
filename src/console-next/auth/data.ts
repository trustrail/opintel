import {z} from 'zod';
import {useQuery} from '@tanstack/react-query';
import {createApiClient} from '../../shared/api/client.js';
import {read} from '../home/data.js';
export const Providers=z.object({magicLink:z.boolean(),providers:z.array(z.object({provider:z.string(),displayName:z.string(),startPath:z.string()})),enforced:z.string().nullable()});
export const authKeys={providers:(email:string)=>['console-next','auth','providers',email] as const};
export const Callback=z.object({deviceMismatch:z.boolean()});
export const Session=z.object({id:z.uuid(),email:z.email(),deviceConfirmed:z.boolean(),sessionCreatedAt:z.string()});
export function useProviders(email:string,enabled:boolean){return useQuery({queryKey:authKeys.providers(email),enabled,placeholderData:old=>old,retry:false,queryFn:()=>read(createApiClient(),'/api/v1/auth/providers'+(email?'?'+new URLSearchParams({email}):''),Providers)});}
export async function requestLink(email:string,deviceNonce:string){const r=await createApiClient().request({path:'/api/v1/auth/request-link',method:'POST',body:{email,deviceNonce},response:z.undefined()});if(!r.ok)throw r.error;}
export async function completeLink(path:'/api/v1/auth/callback'|'/api/v1/auth/confirm-device',token:string,deviceNonce:string,confirm?:boolean){const r=await createApiClient().request({path,method:'POST',body:{token,deviceNonce,...confirm===undefined?{}:{confirm}},response:Callback});if(!r.ok)throw r.error;return r.value;}
export async function currentSession(){return read(createApiClient(),'/api/v1/auth/me',Session);}
