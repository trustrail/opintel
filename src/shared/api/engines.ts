import {z} from 'zod';
import {EngineId,SourceId} from '../kernel/value-objects.js';
export const enginePin=z.string().trim().regex(/^(?:[0-9a-f]{64}|(?:[0-9a-f]{2}:){31}[0-9a-f]{2})$/iu).transform(v=>v.replaceAll(':','').toUpperCase());
export const EngineRegistration=z.strictObject({name:z.string().trim().min(1).max(80),address:z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';},'Use an HTTPS engine address without a path or credentials.').transform(v=>new URL(v).origin),certificatePin:enginePin});
export const EngineView=z.object({id:z.uuid().transform(EngineId),name:z.string(),address:z.string(),certificatePin:z.string(),contractVersion:z.number().int().nullable(),verifiedAt:z.iso.datetime({offset:true}).nullable(),lastSeenAt:z.iso.datetime({offset:true}).nullable(),health:z.enum(['unverified','healthy','unavailable','contract_mismatch']),healthMessage:z.string().nullable(),custody:z.boolean(),sources:z.array(z.object({id:z.uuid().transform(SourceId),name:z.string()}))});
export const EnginePage=z.object({items:z.array(EngineView),nextCursor:z.string().nullable()});
export const EngineAssignment=z.strictObject({engineId:z.uuid().transform(EngineId)});
export type EngineRegistration=z.infer<typeof EngineRegistration>;
export type EngineView=z.infer<typeof EngineView>;

export const EngineMutationResponse=z.object({ok:z.literal(true)});
export function engineOpenApiDocument(){
 const parameter=(name:string)=>({name,in:'path',required:true,schema:{type:'string',format:'uuid'}});
 const response=(schema:z.ZodType)=>({description:'Success',content:{'application/json':{schema:z.toJSONSchema(schema,{io:'input'})}}});
 const failure={description:'Standard error envelope',content:{'application/json':{schema:z.toJSONSchema(z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string(),retryable:z.boolean(),details:z.record(z.string(),z.unknown()).optional()})}))}}};
 const mutation=(schema:z.ZodType,status='200')=>({description:'Requires project#administer.',requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(schema,{io:'input'})}}},responses:{[status]:response(EngineMutationResponse),default:failure}});
 return {openapi:'3.1.0',info:{title:'Opintel engine registry',version:'1'},components:{securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'opintel_session'}}},security:[{sessionCookie:[]}],paths:{
  '/api/v1/projects/{id}/engines':{parameters:[parameter('id')],get:{description:'Requires project#view. Cursor pagination.',parameters:[{name:'cursor',in:'query',schema:{type:'string',format:'uuid'}},{name:'limit',in:'query',schema:{type:'integer',minimum:1}}],responses:{'200':response(EnginePage),default:failure}},post:mutation(EngineRegistration,'201')},
  '/api/v1/projects/{id}/engines/{engineId}':{parameters:[parameter('id'),parameter('engineId')],patch:mutation(EngineRegistration)},
  '/api/v1/projects/{id}/engines/{engineId}/verify':{parameters:[parameter('id'),parameter('engineId')],post:mutation(z.strictObject({}))},
  '/api/v1/projects/{id}/engines/{engineId}/custody':{parameters:[parameter('id'),parameter('engineId')],post:mutation(z.strictObject({}))},
  '/api/v1/projects/{id}/sources/{sourceId}/engine':{parameters:[parameter('id'),parameter('sourceId')],patch:mutation(EngineAssignment)},
 }};
}
