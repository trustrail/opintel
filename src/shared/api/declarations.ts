import { declaredTokenDomain } from '../token-domain.js';
import { z } from 'zod';
import { createApiClient } from './client.js';
// Reads preserve the stored facts, including an invalid legacy declaration an
// administrator needs to repair. Commands validate values before any write.
export const IanaTimezone = z.string().refine(value => {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/u.test(value)) return false;
  try { new Intl.DateTimeFormat('en', {timeZone:value}); return true; } catch { return false; }
}, 'Use a valid IANA timezone such as America/Toronto.');
export const DeclarationValues = z.strictObject({tokenDomain:z.string().nullable(),caseInsensitive:z.boolean().nullable(),sourceTimezone:z.string().nullable(),epochUnit:z.enum(['seconds','milliseconds']).nullable(),canonId:z.string().nullable()});
export const DeclarationCommand = DeclarationValues.extend({
  tokenDomain:declaredTokenDomain.nullable(),
  sourceTimezone:IanaTimezone.nullable(),canonId:z.string().regex(/^[a-z0-9]+$(?![\s\S])/u,'Choose an advertised lowercase alphanumeric canonicaliser ID.').nullable(),confirmation:z.string().optional(),
});
export type DeclarationValues = z.infer<typeof DeclarationValues>;
export type DeclarationCommand = z.infer<typeof DeclarationCommand>;
export const EffectiveDeclarations = z.object({ tokenDomain: z.string(), caseInsensitive: z.boolean(), sourceTimezone: z.string().nullable(), epochUnit: z.enum(['seconds','milliseconds']).nullable(), canonId: z.string(), mode: z.enum(['text','number','date','timestamp']) });
export const ElementDeclarations = z.object({
  elementId: z.uuid(), sourceId: z.uuid(), schemaName: z.string(), qualifiedName: z.string(), exposedType: z.string().nullable(),
  projectName: z.string(), stored: DeclarationValues, schemaTimezone: z.string().nullable(), effective: EffectiveDeclarations,
  tokenizedEntitlements: z.number().int().nonnegative(), canonicalisers: z.array(z.string()), discoveryError: z.string().nullable(),
});
export type ElementDeclarations = z.infer<typeof ElementDeclarations>;
export const SchemaDeclarations = z.object({ sourceId: z.uuid(), schemaName: z.string(), qualifiedName: z.string(), sourceTimezone: z.string().nullable(), projectName: z.string(), tokenizedInheritors: z.number().int().nonnegative() });
export const SchemaDeclarationCommand = z.strictObject({ sourceTimezone: IanaTimezone.nullable(), confirmation: z.string().optional() });
export const DeclarationSearch = z.object({sourceId:z.uuid().optional().catch(undefined),elementId:z.uuid().optional().catch(undefined),declarationSchema:z.string().max(512).optional().catch(undefined)});
export function declarationsPath(project: string, element: string) { return `/api/v1/projects/${project}/catalog/elements/${element}/declarations`; }
export function schemaDeclarationsPath(project: string, source: string, schema: string) { return `/api/v1/projects/${project}/catalog/sources/${source}/schemas/${encodeURIComponent(schema)}/declarations`; }
export function readDeclarations(project: string, element: string, client = createApiClient()) { return client.request({path: declarationsPath(project,element), response:ElementDeclarations}); }
export function saveDeclarations(project: string, element: string, body: DeclarationCommand, client = createApiClient()) { return client.request({path:declarationsPath(project,element),method:'PUT',body,response:ElementDeclarations}); }
export function declarationOpenApiDocument() {
  const parameter=(name:string,uuid=true)=>({name,in:'path',required:true,schema:uuid?{type:'string',format:'uuid'}:{type:'string'}});
  const failure=z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string(),retryable:z.boolean(),details:z.record(z.string(),z.unknown()).optional()})});
  const operation=(response:z.ZodType,body?:z.ZodType)=>({description:`Requires project#${body?'administer':'view'}. Stored and effective declarations are distinct.`,...(body?{requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(body)}}}}:{}),responses:{'200':{description:'Declarations',content:{'application/json':{schema:z.toJSONSchema(response)}}},default:{description:'Error envelope',content:{'application/json':{schema:z.toJSONSchema(failure)}}}}});
  return {openapi:'3.1.0',info:{title:'Opintel declarations',version:'1'},components:{securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'opintel_session'}}},security:[{sessionCookie:[]}],paths:{
    '/api/v1/projects/{id}/catalog/elements/{elementId}/declarations':{parameters:[parameter('id'),parameter('elementId')],get:operation(ElementDeclarations),put:operation(ElementDeclarations,DeclarationCommand)},
    '/api/v1/projects/{id}/catalog/sources/{sourceId}/schemas/{schema}/declarations':{parameters:[parameter('id'),parameter('sourceId'),parameter('schema',false)],get:operation(SchemaDeclarations),put:operation(SchemaDeclarations,SchemaDeclarationCommand)},
  }};
}
