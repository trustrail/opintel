import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { DeclarationCommand,ElementDeclarations,SchemaDeclarations,SchemaDeclarationCommand } from '../../../shared/api/declarations.js';
import { ProjectId,ElementId,SourceId } from '../../../shared/kernel/index.js';
import type { DeclarationRepository } from '../application/declarations.js';
import type { TemporalRepository } from '../application/temporal.js';
export function declarationRoutes(repository:DeclarationRepository,temporal:TemporalRepository){
 const params=z.object({id:z.uuid(),elementId:z.uuid()}),schemaParams=z.object({id:z.uuid(),sourceId:z.uuid(),schema:z.string().min(1).max(512)});
 return [
  defineRoute({method:'GET',path:'/api/v1/projects/:id/catalog/elements/:elementId/declarations',params,request:z.undefined(),response:z.union([ElementDeclarations,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{const result=await repository.read({projectId:ProjectId(r.params.id),userId:r.actor.id},ElementId(r.params.elementId));if(!result.ok)throw result.error;return {body:result.value};}}),
  defineRoute({method:'PUT',path:'/api/v1/projects/:id/catalog/elements/:elementId/declarations',params,request:DeclarationCommand,response:z.union([ElementDeclarations,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'administer'},handle:async r=>{const result=await repository.save({projectId:ProjectId(r.params.id),userId:r.actor.id},ElementId(r.params.elementId),r.body);if(!result.ok)throw result.error;return {body:result.value};}}),
  defineRoute({method:'GET',path:'/api/v1/projects/:id/catalog/sources/:sourceId/schemas/:schema/declarations',params:schemaParams,request:z.undefined(),response:z.union([SchemaDeclarations,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{const result=await repository.schema({projectId:ProjectId(r.params.id),userId:r.actor.id},SourceId(r.params.sourceId),r.params.schema);if(!result.ok)throw result.error;return {body:result.value};}}),
  defineRoute({method:'PUT',path:'/api/v1/projects/:id/catalog/sources/:sourceId/schemas/:schema/declarations',params:schemaParams,request:SchemaDeclarationCommand,response:z.union([SchemaDeclarations,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.params.id,permission:'administer'},handle:async r=>{const ctx={projectId:ProjectId(r.params.id),userId:r.actor.id},source=SourceId(r.params.sourceId);const result=await temporal.setSchema(ctx,source,r.params.schema,r.body);if(!result.ok)throw result.error;const read=await repository.schema(ctx,source,r.params.schema);if(!read.ok)throw read.error;return {body:read.value};}}),
 ];
}
