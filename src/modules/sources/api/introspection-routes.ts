import { z } from 'zod';
import { defineRoute,errorEnvelopeSchema,cursorPagination } from '../../../platform/http/index.js';
import { IntrospectionRunView,IntrospectionRunList } from '../../../shared/api/introspection.js';
import { DomainError,ProjectId,SourceId,RunId } from '../../../shared/kernel/index.js';
import type { IntrospectionQuery } from '../application/introspection-query.js';
const params=z.object({id:z.uuid(),runId:z.uuid()});
const cursor=z.string().max(1024).transform((value,ctx)=>{try{if(!/^[\w-]+$/.test(value))throw new Error();return z.object({project:z.uuid(),source:z.uuid(),run:z.uuid()}).parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));}catch{ctx.addIssue({code:'custom',message:'Invalid introspection cursor.'});return z.NEVER;}});
export function introspectionRoutes(service:IntrospectionQuery){return [
 defineRoute({method:'GET',path:'/api/v1/projects/:id/sources/:sourceId/introspections',params:z.object({id:z.uuid(),sourceId:z.uuid()}),request:z.undefined(),query:z.object({cursor:cursor.optional(),limit:z.coerce.number().int().positive().optional()}),permission:{resource:'project',id:r=>r.params.id,permission:'view'},response:z.union([IntrospectionRunList,errorEnvelopeSchema]),handle:async r=>{
  const c=r.query.cursor;if(c&&(c.project!==r.params.id||c.source!==r.params.sourceId))throw new DomainError('validation_failed','This cursor belongs to a different project or source.');
  const page=cursorPagination(undefined,r.query.limit);const result=await service.list({projectId:ProjectId(r.params.id),userId:r.actor.id},SourceId(r.params.sourceId),c?RunId(c.run):null,page.limit+1);if(!result.ok)throw result.error;
  const items=result.value.slice(0,page.limit);return {body:{items,nextCursor:result.value.length>page.limit?Buffer.from(JSON.stringify({project:r.params.id,source:r.params.sourceId,run:items.at(-1)!.id})).toString('base64url'):null},headers:page.warning?{Warning:page.warning}:undefined};
 }}),
 defineRoute({method:'GET',path:'/api/v1/projects/:id/introspections/:runId',params,request:z.undefined(),permission:{resource:'project',id:r=>r.params.id,permission:'view'},response:z.union([IntrospectionRunView,errorEnvelopeSchema]),handle:async r=>{const result=await service.read({projectId:ProjectId(r.params.id),userId:r.actor.id},RunId(r.params.runId));if(!result.ok)throw result.error;return {body:result.value};}}),
 defineRoute({method:'POST',path:'/api/v1/projects/:id/introspections/:runId/cancel',params,request:z.object({}),permission:{resource:'project',id:r=>r.params.id,permission:'bind_source'},response:z.union([IntrospectionRunView,errorEnvelopeSchema]),handle:async r=>{const result=await service.cancel({projectId:ProjectId(r.params.id),userId:r.actor.id},RunId(r.params.runId));if(!result.ok)throw result.error;return {status:200,body:result.value};}}),
];}
