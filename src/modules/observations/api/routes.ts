import {z} from 'zod';
import {defineRoute,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {DomainError,ProjectId} from '../../../shared/kernel/index.js';
import {ObservationPage,ObservationMemberPage,ObservationQuery,ObservationMemberQuery} from '../../../shared/api/observations.js';
import type {ObservationReader} from '../application/read.js';
const cursorSchema=z.object({project:z.uuid(),view:z.enum(['open','resolved']),custody:z.boolean(),group:z.string().nullable(),after:z.string()});
export function observationRoutes(reader:ObservationReader){return [false,true].flatMap(custody=>{
 const path=`/api/v1/projects/:id/${custody?'custody-observations':'observations'}`;
 return [false,true].map(members=>defineRoute({method:'GET',path:path+(members?'/members':''),params:z.object({id:z.uuid()}),request:z.undefined(),query:members?ObservationMemberQuery:ObservationQuery,
 permission:{resource:'project',id:r=>r.params.id,permission:custody?'administer':'view'},response:z.union([members?ObservationMemberPage:ObservationPage,errorEnvelopeSchema]),
 handle:async r=>{
  const group=members?ObservationMemberQuery.parse(r.query).group:null;let after:string|null=null;
  if(r.query.cursor){let cursor:z.infer<typeof cursorSchema>;try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(r.query.cursor,'base64url').toString('utf8')));}catch{throw new DomainError('validation_failed','Invalid observation cursor.');}
   if(cursor.project!==r.params.id||cursor.view!==r.query.view||cursor.custody!==custody||cursor.group!==group)throw new DomainError('validation_failed','This observation cursor belongs to a different scope.');after=cursor.after;}
  const ctx={projectId:ProjectId(r.params.id),userId:r.actor.id},scope={custody,view:r.query.view};
  const result=group!==null?await reader.members(ctx,scope,group,after,r.query.limit):await reader.groups(ctx,scope,after,r.query.limit);if(!result.ok)throw result.error;
  return {body:{...result.value,nextCursor:result.value.nextCursor?Buffer.from(JSON.stringify({project:r.params.id,view:r.query.view,custody,group,after:result.value.nextCursor})).toString('base64url'):null}};
 }}));
 });}
