import { z } from 'zod';
import {TypeObservationPage} from './type-observations.js';
import { SourceId, RunId, EngineId, PoolId } from '../kernel/value-objects.js';
import { landingStrategySchema } from '../landing-contract.js';
export const TestSourceBody = z.strictObject({ engineId:z.uuid().transform(EngineId), kind: z.literal('postgres'), credentialRef: z.string().startsWith('secret://').min(10) });
export const TestSourceResponse = z.object({ reachable: z.boolean(), reason: z.string().nullable(), schemas: z.array(z.string()) });
export const CreateSourceBody = TestSourceBody.extend({ name: z.string().trim().min(1).max(80), includeSchemas: z.array(z.string().min(1)).max(100).default([]), samplingConsent: z.boolean(), receivesLandings: z.boolean(), landingStrategy: landingStrategySchema.nullable() }).refine(v=>v.receivesLandings ? v.landingStrategy!==null : v.landingStrategy===null,{message:'Choose a landing strategy only for a source receiving landings.',path:['landingStrategy']});
export const SourceListItem = z.object({ id:z.uuid().transform(SourceId),engineId:z.uuid().transform(EngineId).nullable().optional(),name:z.string(),exposedAlias:z.string(),kind:z.string(),origin:z.literal('customer'),status:z.string(),error:z.string().nullable(),includeSchemas:z.array(z.string()).default([]),landingStrategy:landingStrategySchema.nullable(),objectCount:z.number().int().nonnegative().optional(),lastLandedAt:z.iso.datetime({offset:true}).nullable().optional(),quarantinedCount:z.number().int().nonnegative().optional(),exposure:z.array(z.object({value:z.enum(['clear','masked','aggregate_only','tokenized','withheld','undecided', 'custody']),count:z.number().int().nonnegative()})).optional(),decisionPools:z.array(z.object({id:z.uuid().transform(PoolId),name:z.string(),undecidedCount:z.number().int().nonnegative(),decisions:z.array(z.object({value:z.enum(['clear','masked','aggregate_only','tokenized','withheld','undecided', 'custody']),count:z.number().int().nonnegative()}))})).optional(),filingCount:z.number().int().nullable(),elementCount:z.number().int(),unsupportedCount:z.number().int().nonnegative(),undecidedCount:z.number().int(),latestIntrospectionId:z.uuid().transform(RunId).nullable(),lastIntrospectedAt:z.iso.datetime({offset:true}).nullable() });
export const SourceListResponse=z.object({items:z.array(SourceListItem),nextCursor:z.string().nullable()});
export const IntrospectSourceBody=z.strictObject({projectId:z.uuid()});
export type SourceItem=z.infer<typeof SourceListItem>;
export type NewSource=Omit<z.infer<typeof CreateSourceBody>,'engineId'>&{engineId?:import('../kernel/value-objects.js').EngineId};

export function sourceOpenApiDocument(){
 const id={name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}};
 const failure={description:'Standard error envelope',content:{'application/json':{schema:z.toJSONSchema(z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string(),retryable:z.boolean(),details:z.record(z.string(),z.unknown()).optional()})}))}}};
 const response=(schema:z.ZodType)=>({description:'Success',content:{'application/json':{schema:z.toJSONSchema(schema,{io:'input'})}}});
 const request=(body:z.ZodType,result:z.ZodType,status:string)=>({requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(body,{io:'input'})}}},responses:{[status]:response(result),default:failure}});
 return {openapi:'3.1.0',info:{title:'Opintel source registration',version:'1'},components:{securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'opintel_session'}}},security:[{sessionCookie:[]}],paths:{
  '/api/v1/projects/{id}/type-observations':{parameters:[id],get:{description:'Requires project#view. Current unmapped source-type findings, cursor-paged by source id and type.',parameters:[{name:'cursor',in:'query',schema:{type:'string'}},{name:'limit',in:'query',schema:{type:'integer',minimum:1}}],responses:{'200':response(TypeObservationPage),default:failure}}},
  '/api/v1/projects/{id}/sources':{parameters:[id],get:{description:'Requires project#view. Cursor pagination.',parameters:[{name:'cursor',in:'query',schema:{type:'string'}},{name:'limit',in:'query',schema:{type:'integer',minimum:1}}],responses:{'200':response(SourceListResponse),default:failure}},post:{description:'Requires project#bind_source.',...request(CreateSourceBody,SourceListItem,'201')}},
  '/api/v1/sources/{id}':{parameters:[id],delete:{description:'Requires project#bind_source. Archives and retains all historical rows. Conflicts list dependent pools and counts until confirmed with the source name.',...request(ArchiveSourceBody,SourceListItem,'200')}},
  '/api/v1/sources/{id}/schemas':{parameters:[id],get:{description:'Requires project#bind_source. Saved source only; applied engine policy required.',parameters:[{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':response(SourceSchemas),default:failure}},put:{description:'Requires project#bind_source. Save the selected schemas and start a scan.',...request(SelectSourceSchemas,SourceListItem,'202')}},
  '/api/v1/sources/{id}/introspect':{parameters:[id],post:{description:'Requires project#bind_source. Source must belong to the submitted project. Reuses stored schema selection.',...request(IntrospectSourceBody,SourceListItem,'202')}},
  '/api/v1/projects/{id}/sources/test':{parameters:[id],post:{description:'Requires project#bind_source.',...request(TestSourceBody,TestSourceResponse,'200')}},
 }};
}

export const ArchiveSourceBody = z.strictObject({projectId:z.uuid(),confirmation:z.string().optional()});

export const SourceSchemas=z.strictObject({schemas:z.array(z.string()),included:z.array(z.string())});
export const SelectSourceSchemas=z.strictObject({projectId:z.uuid(),includeSchemas:z.array(z.string().min(1)).min(1).max(100).refine(v=>new Set(v).size===v.length,'Choose each schema once.')});
