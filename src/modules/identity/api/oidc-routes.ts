import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {CompanyId,InviteId,DomainError} from '../../../shared/kernel/index.js';
import type {OidcService} from '../application/oidc.js';
import {sessionCookie} from './session-cookie.js';
import {cookieValue} from './current-user-routes.js';

export function oidcRoutes(service:OidcService,appBaseUrl:string){
 const params=z.object({provider:z.string().regex(/^oidc:[a-zA-Z0-9_-]+$/)});
 const callbackPath=(provider:string)=>`/auth/oidc/${provider}/callback`;
 const flowCookie=(state:string)=>`opintel_oidc=${state}; Path=/auth/oidc; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
 return [
  defineRoute({method:'GET',path:'/auth/oidc/:provider/start',permission:'public',params,
   query:z.object({companyId:z.uuid().optional(),inviteId:z.uuid().optional(),deviceNonce:z.string().min(1).max(256).optional()}),request:z.undefined(),response:z.undefined(),
   handle:async r=>{
    const origin=new URL(appBaseUrl).origin;
    const result=await service.begin({provider:r.params.provider,companyId:r.query.companyId?CompanyId(r.query.companyId):null,inviteId:r.query.inviteId?InviteId(r.query.inviteId):null,deviceNonce:r.query.deviceNonce??randomBytes(16).toString('base64url'),redirectUri:origin+callbackPath(r.params.provider)});
    return {status:302,headers:{location:result.authorizationUrl,'set-cookie':flowCookie(result.state),'cache-control':'no-store','referrer-policy':'no-referrer'},body:undefined};
   }}),
  defineRoute({method:'GET',path:'/auth/oidc/:provider/callback',permission:'public',params,
   query:z.object({state:z.string().min(1),code:z.string().optional(),error:z.string().optional(),iss:z.string().optional(),session_state:z.string().optional()}),request:z.undefined(),response:z.undefined(),
   handle:async r=>{
    if(cookieValue(r.headers.cookie,'opintel_oidc')!==r.query.state)throw new DomainError('unauthenticated','This sign-in request is no longer valid.');
    const origin=new URL(appBaseUrl).origin;
    const url=new URL(origin+callbackPath(r.params.provider));
    for(const [key,value] of Object.entries(r.query))if(value!==undefined)url.searchParams.set(key,value);
    const ua=r.headers['user-agent'];
    const result=await service.callback(r.query.state,url.toString(),{ip:'unknown',userAgent:Array.isArray(ua)?ua[0]??'unknown':ua??'unknown'},r.params.provider);
    if(result.kind==='refused')throw new DomainError('unauthenticated',result.message);
    return {status:302,headers:{location:origin+'/projects','set-cookie':sessionCookie(result.sessionId),'cache-control':'no-store','referrer-policy':'no-referrer'},body:undefined};
   }}),
 ];
}
