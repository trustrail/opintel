import {z} from 'zod';
import {ActivityFilters,EvidenceDetail} from './activity.js';
import {createApiClient} from './client.js';
export const ExportFilters=ActivityFilters.extend({elementId:z.uuid().optional()}).strict();
export const CreateEvidenceExport=z.object({format:z.enum(['ndjson','csv']),filters:ExportFilters.default({})}).strict().refine(v=>!v.filters.from||!v.filters.to||Date.parse(v.filters.from)<Date.parse(v.filters.to),'The end must be after the start.');
export const EvidenceExportDescriptor=z.object({id:z.uuid(),projectId:z.uuid(),format:z.enum(['ndjson','csv']),filters:ExportFilters,createdAt:z.iso.datetime({offset:true})});
export const EvidenceExportStatus=EvidenceExportDescriptor.extend({status:z.literal('ready'),downloadUrl:z.string(),expiresAt:z.iso.datetime({offset:true})});
export const EvidenceExportRecord=EvidenceDetail.extend({demoProvenance:z.enum(['none','unknown'])});
export const ExportScope=z.object({projectId:z.uuid()});
export const ExportDownloadQuery=ExportScope.extend({expires:z.coerce.number().int().positive(),signature:z.string().regex(/^[a-f0-9]{64}$/)});
export type ExportFilters=z.infer<typeof ExportFilters>;
export type EvidenceExportDescriptor=z.infer<typeof EvidenceExportDescriptor>;
export type EvidenceExportRecord=z.infer<typeof EvidenceExportRecord>;
export type ExportCommand=z.infer<typeof CreateEvidenceExport>;
export function createEvidenceExport(projectId:string,body:ExportCommand,key:string,client=createApiClient()){return client.request({method:'POST',path:`/api/v1/projects/${projectId}/exports`,body,headers:{'Idempotency-Key':key},response:EvidenceExportDescriptor});}
export function evidenceExportStatus(projectId:string,id:string,client=createApiClient()){return client.request({path:`/api/v1/exports/${id}?${new URLSearchParams({projectId})}`,response:EvidenceExportStatus});}
// Downloads use fetch's ReadableStream directly; the JSON client buffers bodies.
export function evidenceExportOpenApiDocument(){
 const content=(schema:z.ZodType)=>({'application/json':{schema:z.toJSONSchema(schema)}});
 const parameters=(query:z.ZodObject)=>[{name:'id',in:'path',required:true,schema:z.toJSONSchema(z.uuid())},...Object.entries(query.shape).map(([name,schema])=>({name,in:'query',required:true,schema:z.toJSONSchema(schema)}))];
 return {openapi:'3.1.0',info:{title:'Evidence exports',version:'1'},paths:{
  '/projects/{id}/exports':{post:{'x-permission':'project#export_evidence',parameters:[...parameters(z.object({})),{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string'}}],requestBody:{required:true,content:content(CreateEvidenceExport)},responses:{201:{description:'Export descriptor',content:content(EvidenceExportDescriptor)}}}},
  '/exports/{id}':{get:{'x-permission':'project#export_evidence',parameters:parameters(ExportScope),responses:{200:{description:'Ready for streaming download',content:content(EvidenceExportStatus)}}}},
  '/exports/{id}/download':{get:{'x-permission':'project#export_evidence',parameters:parameters(ExportDownloadQuery),responses:{200:{description:'One record per line or CSV row; nested CSV fields contain JSON',content:{'application/x-ndjson':{schema:z.toJSONSchema(EvidenceExportRecord)},'text/csv':{schema:{type:'string'}}}}}}}
 }};
}
