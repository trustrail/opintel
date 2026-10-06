import {z} from 'zod';
import {defineRoute,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {ProjectId} from '../../../shared/kernel/index.js';
import {SuggestionQuery,DomainQuery,SuggestionPage,DomainPage,AttemptPage,SuggestionAction} from '../../../shared/api/suggestions.js';
import type {SuggestionRepository} from '../application/review.js';
export function suggestionRoutes(repo:SuggestionRepository){
 const project=z.object({id:z.uuid()}),pair=project.extend({suggestionId:z.uuid()});
 return [
 defineRoute({method:'GET',path:'/api/v1/projects/:id/suggestions',params:project,request:z.undefined(),query:SuggestionQuery,response:z.union([SuggestionPage,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{const v=await repo.list({projectId:ProjectId(r.params.id),userId:r.actor.id},r.query.cursor,r.query.limit);if(!v.ok)throw v.error;return {headers:{'Cache-Control':'no-store'},body:v.value};}}),
 defineRoute({method:'GET',path:'/api/v1/projects/:id/suggestions/domains',params:project,request:z.undefined(),query:DomainQuery,response:z.union([DomainPage,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{const v=await repo.domains({projectId:ProjectId(r.params.id),userId:r.actor.id},r.query.cursor,r.query.limit);if(!v.ok)throw v.error;return {headers:{'Cache-Control':'no-store'},body:v.value};}}),
 defineRoute({method:'GET',path:'/api/v1/projects/:id/suggestions/:suggestionId/attempts',params:pair,request:z.undefined(),query:SuggestionQuery,response:z.union([AttemptPage,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{const v=await repo.attempts({projectId:ProjectId(r.params.id),userId:r.actor.id},r.params.suggestionId,r.query.cursor,r.query.limit);if(!v.ok)throw v.error;return {headers:{'Cache-Control':'no-store'},body:v.value};}}),
 defineRoute({method:'POST',path:'/api/v1/projects/:id/suggestions/:suggestionId/decisions',params:pair,request:SuggestionAction,response:z.union([z.object({recorded:z.literal(true)}),errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'administer'},handle:async r=>{const v=await repo.decide({projectId:ProjectId(r.params.id),userId:r.actor.id},r.params.suggestionId,r.body);if(!v.ok)throw v.error;return {body:{recorded:true as const}};}}),
 ];
}
