import {z} from 'zod';
import {defineRoute,cursorPagination} from '../../../platform/http/index.js';
import {ProjectId,DomainError,type Result} from '../../../shared/kernel/index.js';
import {DashboardStats,DashboardFeed,PoolShields,DashboardPageQuery} from '../../../shared/api/dashboard.js';
import type {DashboardReader,DashboardContext} from '../application/dashboard.js';
export function dashboardRoutes(reader:DashboardReader){return [
 defineRoute({method:'GET',path:'/api/v1/projects/:id/stats',params:z.object({id:z.uuid()}),request:z.undefined(),response:DashboardStats,permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{const result=await reader.stats({projectId:ProjectId(r.params.id),userId:r.actor.id});if(!result.ok)throw result.error;return {body:result.value,headers:{'cache-control':'no-store'}};}}),
 pageRoute('feed',DashboardFeed,(ctx,after,limit)=>reader.feed(ctx,after,limit)),
 pageRoute('pools',PoolShields,(ctx,after,limit)=>reader.pools(ctx,after,limit)),
 ];}

function pageRoute<T extends {id:string}>(kind:'feed'|'pools',schema:z.ZodType<{items:T[];nextCursor:string|null}>,read:(ctx:DashboardContext,after:string|null,limit:number)=>Promise<Result<T[]>>){
return defineRoute({method:'GET',path:`/api/v1/projects/:id/dashboard/${kind}`,params:z.object({id:z.uuid()}),query:DashboardPageQuery,request:z.undefined(),response:schema,permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{
 const scope=JSON.stringify([r.params.id,kind]),paging=cursorPagination(undefined,r.query.limit);let after:string|null=null;
 if(r.query.cursor){try{const c=z.strictObject({scope:z.string(),after:z.string()}).parse(JSON.parse(Buffer.from(r.query.cursor,'base64url').toString('utf8')));if(c.scope!==scope||(kind==='pools'&&!z.uuid().safeParse(c.after).success))throw new Error();after=c.after;}catch{throw new DomainError('validation_failed','This dashboard cursor is invalid or belongs to another project.');}}
 const result=await read({projectId:ProjectId(r.params.id),userId:r.actor.id},after,paging.limit+1);if(!result.ok)throw result.error;const items=result.value.slice(0,paging.limit);return {body:{items,nextCursor:result.value.length>paging.limit?Buffer.from(JSON.stringify({scope,after:items.at(-1)!.id})).toString('base64url'):null},headers:{'cache-control':'no-store',...(paging.warning?{Warning:paging.warning}:{})}};
 } });
}
