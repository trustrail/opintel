import {z} from 'zod';
import {defineRoute,cursorPagination,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {DomainError,ProjectId,SourceId} from '../../../shared/kernel/index.js';
import {TypeObservationPage} from '../../../shared/api/type-observations.js';
import type {TypeObservations} from '../application/type-observations.js';
const cursorSchema=z.object({projectId:z.uuid(),sourceId:z.uuid().transform(SourceId),sourceType:z.string()});
export function typeObservationRoutes(service:TypeObservations){return [
 defineRoute({method:'GET',path:'/api/v1/projects/:id/type-observations',params:z.object({id:z.uuid()}),request:z.undefined(),
 query:z.object({cursor:z.string().max(4096).optional(),limit:z.coerce.number().int().positive().optional()}),
 permission:{resource:'project',id:r=>r.params.id,permission:'view'},response:z.union([TypeObservationPage,errorEnvelopeSchema]),
 handle:async r=>{
  let after:z.infer<typeof cursorSchema>|null=null;
  if(r.query.cursor){try{after=cursorSchema.parse(JSON.parse(Buffer.from(r.query.cursor,'base64url').toString('utf8')));}catch{throw new DomainError('validation_failed','Invalid type-observation cursor.');}
   if(after.projectId!==r.params.id)throw new DomainError('validation_failed','This type-observation cursor belongs to another project.');}
  const page=cursorPagination(undefined,r.query.limit),rows=await service.list({projectId:ProjectId(r.params.id),userId:r.actor.id},after,page.limit+1),items=rows.slice(0,page.limit),last=items.at(-1);
  return {body:{items,nextCursor:rows.length>page.limit&&last?Buffer.from(JSON.stringify({projectId:r.params.id,sourceId:last.sourceId,sourceType:last.sourceType})).toString('base64url'):null}};
 }}),
];}
