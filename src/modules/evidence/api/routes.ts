import {z} from 'zod';
import {defineRoute,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {DomainError,ProjectId,RunId} from '../../../shared/kernel/index.js';
import {ActivityQuery,ActivityFilters,ActivityPage,EvidenceDetail,DetailQuery} from '../../../shared/api/activity.js';
import type {EvidenceQuery,EvidencePosition} from '../application/read.js';
const cursor=z.object({project:z.uuid(),filters:ActivityFilters,after:z.object({id:z.uuid(),at:z.iso.datetime({offset:true})})});
export function evidenceRoutes(service:EvidenceQuery){return [
 defineRoute({method:'GET',path:'/api/v1/projects/:id/runs',params:z.object({id:z.uuid()}),request:z.undefined(),query:ActivityQuery,permission:{resource:'project',id:r=>r.params.id,permission:'view'},response:z.union([ActivityPage,errorEnvelopeSchema]),handle:async r=>{
  const filters=ActivityFilters.parse(r.query);let after:EvidencePosition|null=null;
  if(r.query.cursor)try{const decoded=cursor.parse(JSON.parse(Buffer.from(r.query.cursor,'base64url').toString('utf8')));if(decoded.project!==r.params.id||JSON.stringify(decoded.filters)!==JSON.stringify(filters))throw new Error();after={...decoded.after,id:RunId(decoded.after.id)};}catch{throw new DomainError('validation_failed','This activity cursor does not match the project and filters.');}
  const result=await service.list({projectId:ProjectId(r.params.id),userId:r.actor.id},filters,after,r.query.limit+1);if(!result.ok)throw result.error;
  const items=result.value.slice(0,r.query.limit),last=items.at(-1);
  return {headers:{'Cache-Control':'no-store'},body:{items,nextCursor:result.value.length>r.query.limit&&last?Buffer.from(JSON.stringify({project:r.params.id,filters,after:{id:last.id,at:last.startedAt}})).toString('base64url'):null}};
 }}),
 defineRoute({method:'GET',path:'/api/v1/runs/:id',params:z.object({id:z.uuid()}),request:z.undefined(),query:DetailQuery,permission:{resource:'project',id:r=>r.query.projectId,permission:'view'},response:z.union([EvidenceDetail,errorEnvelopeSchema]),handle:async r=>{const result=await service.detail({projectId:ProjectId(r.query.projectId),userId:r.actor.id},RunId(r.params.id),r.query.startedAt);if(!result.ok)throw result.error;return {headers:{'Cache-Control':'no-store'},body:result.value};}}),
];}
