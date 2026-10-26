import {z} from 'zod';
import type {OutboundMail} from './types.js';
export function mailLink(message:OutboundMail,base:string):URL|null{
 if(message.template==='magic_link'){
  const token=message.vars.token;if(typeof token!=='string'||!token)return null;
  const url=new URL('/auth/callback',base);url.searchParams.set('token',token);return url;
 }
 if(message.template==='invitation'){
  const value=z.object({provider:z.string().regex(/^oidc:[a-zA-Z0-9_-]+$/u),companyId:z.uuid(),inviteId:z.uuid()}).safeParse(message.vars);
  if(!value.success)return null;
  const url=new URL(`/auth/oidc/${value.data.provider}/start`,base);url.searchParams.set('companyId',value.data.companyId);url.searchParams.set('inviteId',value.data.inviteId);return url;
 }
 return null;
}
