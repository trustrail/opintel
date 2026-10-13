import {z} from 'zod';
import {defineRoute,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {ProjectId,ElementId} from '../../../shared/kernel/index.js';
import {ColumnTags,ColumnTagsBody} from '../../../shared/api/column-tags.js';
import type {ColumnTagRepository} from '../application/column-tags.js';
export function columnTagRoutes(repo:ColumnTagRepository){return [
 defineRoute({method:'GET',path:'/api/v1/elements/:id/scope-tags',params:z.object({id:z.uuid()}),query:z.object({projectId:z.uuid()}),request:z.undefined(),response:z.union([ColumnTags,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.query.projectId,permission:'set_entitlement'},handle:async r=>{const result=await repo.read({projectId:ProjectId(r.query.projectId),userId:r.actor.id},ElementId(r.params.id));if(!result.ok)throw result.error;return {body:result.value};}}),
 defineRoute({method:'PUT',path:'/api/v1/elements/:id/scope-tags',params:z.object({id:z.uuid()}),query:z.object({}),request:ColumnTagsBody,response:z.union([ColumnTags,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.body.projectId,permission:'set_entitlement'},handle:async r=>{const result=await repo.save({projectId:ProjectId(r.body.projectId),userId:r.actor.id},ElementId(r.params.id),r.body.tags);if(!result.ok)throw result.error;return {body:result.value};}})
];}
