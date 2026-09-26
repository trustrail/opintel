import { z } from 'zod';
import { defineRoute,cursorPagination,errorEnvelopeSchema } from '../../../platform/http/index.js';
import { EntitlementQuery,EntitlementPage,PoolChoices,ViewDefinitionResponse,PoolChoicesQuery,ViewDefinitionQuery } from '../../../shared/api/entitlement-read.js';
import { DomainError,PoolId,ProjectId } from '../../../shared/kernel/index.js';
import type { EntitlementReader } from '../application/read.js';
const params=z.object({id:z.uuid()});
const paging=PoolChoicesQuery;
function decode(cursor:string|undefined,scope:string){if(!cursor)return null;try{const value=z.object({scope:z.string(),after:z.string()}).parse(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));if(value.scope!==scope)throw new Error();return value.after;}catch{throw new DomainError('validation_failed','This cursor belongs to another selection or is invalid.');}}
const encode=(scope:string,after:string)=>Buffer.from(JSON.stringify({scope,after})).toString('base64url');
export function entitlementReadRoutes(reader:EntitlementReader){return [
 defineRoute({method:'GET',path:'/api/v1/projects/:id/pools',params,request:z.undefined(),query:paging,response:z.union([PoolChoices,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{
 const page=cursorPagination(undefined,r.query.limit),scope=JSON.stringify([r.params.id,'pools']),after=decode(r.query.cursor,scope);if(after&&!z.uuid().safeParse(after).success)throw new DomainError('validation_failed','Invalid pool cursor.');
 const result=await reader.pools({projectId:ProjectId(r.params.id),userId:r.actor.id},after,page.limit+1);if(!result.ok)throw result.error;const items=result.value.slice(0,page.limit);return {body:{items,nextCursor:result.value.length>page.limit?encode(scope,items.at(-1)!.id):null},headers:page.warning?{Warning:page.warning}:undefined};}}),
 defineRoute({method:'GET',path:'/api/v1/pools/:id/entitlements',params,request:z.undefined(),query:EntitlementQuery,response:z.union([EntitlementPage,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.query.projectId,permission:'view'},handle:async r=>{
 const {projectId,parent,prefix,sourceId,undecided}=r.query,page=cursorPagination(undefined,r.query.limit),scope=JSON.stringify([projectId,r.params.id,parent,prefix,sourceId??null,undecided]);
 const result=await reader.tree({projectId:ProjectId(projectId),userId:r.actor.id},PoolId(r.params.id),{parent,prefix,sourceId,undecided:undecided==='true',after:decode(r.query.cursor,scope),limit:page.limit+1});if(!result.ok)throw result.error;const items=result.value.slice(0,page.limit);return {body:{nodes:items.map(i=>i.node),nextCursor:result.value.length>page.limit?encode(scope,items.at(-1)!.position):null},headers:page.warning?{Warning:page.warning}:undefined};}}),
 defineRoute({method:'GET',path:'/api/v1/pools/:id/view-definition',params,request:z.undefined(),query:ViewDefinitionQuery,response:z.union([ViewDefinitionResponse,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.query.projectId,permission:'administer'},handle:async r=>{const result=await reader.definition({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id));if(!result.ok)throw result.error;return {body:result.value};}}),
];}
