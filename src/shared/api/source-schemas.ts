import { z } from 'zod';
import { DemoSourceId, SourceId, RunId } from '../kernel/value-objects.js';
import type { VaultRef } from '../../platform/vault/types.js';
import { landingStrategySchema } from '../landing-contract.js';
export const TestSourceBody = z.strictObject({ kind: z.literal('postgres'), credentialRef: z.string().startsWith('vault://').min(9) });
export const TestSourceResponse = z.object({ reachable: z.boolean(), reason: z.string().nullable(), schemas: z.array(z.string()) });
export const CreateSourceBody = TestSourceBody.extend({ name: z.string().trim().min(1).max(80), includeSchemas: z.array(z.string().min(1)), samplingConsent: z.boolean(), receivesLandings: z.boolean(), landingStrategy: landingStrategySchema.nullable() }).refine(v=>v.receivesLandings ? v.landingStrategy!==null : v.landingStrategy===null,{message:'Choose a landing strategy only for a source receiving landings.',path:['landingStrategy']});
export const SourceListItem = z.object({ id:z.uuid().transform(SourceId),name:z.string(),duckdbAlias:z.string(),kind:z.string(),origin:z.enum(['customer','demo']),status:z.string(),error:z.string().nullable(),landingStrategy:landingStrategySchema.nullable(),filingCount:z.number().int().nullable(),elementCount:z.number().int(),undecidedCount:z.number().int(),latestIntrospectionId:z.uuid().transform(RunId).nullable(),lastIntrospectedAt:z.iso.datetime({offset:true}).nullable() });
export const SourceListResponse=z.object({items:z.array(SourceListItem),nextCursor:z.string().nullable()});
export const IntrospectSourceBody=z.strictObject({projectId:z.uuid()});
export const FromDemoBody=z.strictObject({demoTemplateId:z.uuid().transform(DemoSourceId)});
export const Deployment=z.strictObject({sourceId:z.uuid().transform(SourceId),credentialRef:z.string().startsWith('vault://').min(9).transform(value=>value as VaultRef),landingZone:z.string().min(1).nullable(),sourceName:z.string().min(1).max(80)});
export const DeploymentRef=z.record(z.uuid(),Deployment);
export const DemoTemplateItem=z.object({id:z.uuid().transform(DemoSourceId),name:z.string(),narrative:z.string().nullable(),prepared:z.boolean(),connected:z.boolean()});
export const DemoTemplateList=z.array(DemoTemplateItem);
export type SourceItem=z.infer<typeof SourceListItem>;
export type NewSource=z.infer<typeof CreateSourceBody>;

export function sourceOpenApiDocument(){
 const id={name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}};
 const failure={description:'Standard error envelope',content:{'application/json':{schema:z.toJSONSchema(z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string(),retryable:z.boolean(),details:z.record(z.string(),z.unknown()).optional()})}))}}};
 const response=(schema:z.ZodType)=>({description:'Success',content:{'application/json':{schema:z.toJSONSchema(schema,{io:'input'})}}});
 const request=(body:z.ZodType,result:z.ZodType,status:string)=>({requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(body,{io:'input'})}}},responses:{[status]:response(result),default:failure}});
 return {openapi:'3.1.0',info:{title:'Opintel source registration',version:'1'},components:{securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'opintel_session'}}},security:[{sessionCookie:[]}],paths:{
  '/api/v1/projects/{id}/sources':{parameters:[id],get:{description:'Requires project#view. Cursor pagination.',parameters:[{name:'cursor',in:'query',schema:{type:'string'}},{name:'limit',in:'query',schema:{type:'integer',minimum:1}}],responses:{'200':response(SourceListResponse),default:failure}},post:{description:'Requires project#bind_source.',...request(CreateSourceBody,SourceListItem,'201')}},
  '/api/v1/sources/{id}':{parameters:[id],delete:{description:'Requires project#bind_source. Archives and retains all historical rows. Conflicts list dependent pools and counts until confirmed with the source name.',...request(ArchiveSourceBody,SourceListItem,'200')}},
  '/api/v1/sources/{id}/introspect':{parameters:[id],post:{description:'Requires project#bind_source. Source must belong to the submitted project. Reuses stored schema selection.',...request(IntrospectSourceBody,SourceListItem,'202')}},
  '/api/v1/projects/{id}/sources/test':{parameters:[id],post:{description:'Requires project#bind_source.',...request(TestSourceBody,TestSourceResponse,'200')}},
  '/api/v1/projects/{id}/sources/from-demo':{parameters:[id],post:{description:'Requires project#bind_source.',...request(FromDemoBody,SourceListItem,'201'),responses:{'201':response(SourceListItem),'202':response(SourceListItem),'200':response(SourceListItem),default:failure}}},
  '/api/v1/industries/{id}/demo-sources':{parameters:[id],get:{description:'Requires project#view. Industry must match this project. Deployment secrets are omitted.',parameters:[{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':response(DemoTemplateList),default:failure}}},
 }};
}

export const ArchiveSourceBody = z.strictObject({projectId:z.uuid(),confirmation:z.string().optional()});
