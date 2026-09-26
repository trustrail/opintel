import { z } from 'zod';
import { CatalogNode } from './catalog.js';
import { BulkEntitlementBody,BulkEntitlementError } from './bulk-entitlements.js';
import { createApiClient } from './client.js';
export const EntitlementNode = CatalogNode.omit({state:true}).extend({treatment:BulkEntitlementBody.shape.treatment.nullable(),maskKind:BulkEntitlementBody.shape.maskKind,justification:z.string().nullable()});
export type EntitlementNode = z.infer<typeof EntitlementNode>;
export const EntitlementPage = z.object({nodes:z.array(EntitlementNode),nextCursor:z.string().nullable()});
export const PoolChoices = z.object({items:z.array(z.object({id:z.uuid(),name:z.string(),sourceIds:z.array(z.uuid())})),nextCursor:z.string().nullable()});
export const ViewDefinitionResponse = z.object({views:z.array(z.object({catalog:z.string(),schema:z.string(),name:z.string(),ddl:z.string()})),omitted:z.array(z.object({catalog:z.string(),schema:z.string(),name:z.string(),reason:z.enum(['all_withheld','all_undecided','mixed_withheld_undecided'])}))});
export type ViewDefinitionResponse = z.infer<typeof ViewDefinitionResponse>;
export const EntitlementQuery = z.object({projectId:z.uuid(),parent:z.string().max(512).default(''),prefix:z.string().max(63).default(''),undecided:z.enum(['true','false']).default('false'),sourceId:z.uuid().optional(),cursor:z.string().max(2048).optional(),limit:z.coerce.number().int().positive().optional()});
export type EntitlementFilter = {parent?:string;prefix?:string;undecided?:'true'|'false';sourceId?:string;cursor?:string;limit?:number};
export function readEntitlements(projectId:string,poolId:string,filter:EntitlementFilter,client=createApiClient()) {
 const query=new URLSearchParams({projectId});for(const [key,value]of Object.entries(filter))if(value!==undefined)query.set(key,String(value));
 return client.request({path:`/api/v1/pools/${poolId}/entitlements?${query}`,response:EntitlementPage});
}
export const PoolChoicesQuery=z.object({cursor:z.string().max(2048).optional(),limit:z.coerce.number().int().positive().optional()});
export const ViewDefinitionQuery=z.object({projectId:z.uuid()});
export function entitlementReadOpenApiDocument(){
 const routes:Array<{path:string;response:z.ZodType;query:z.ZodType;description:string}>=[
  {path:'/api/v1/projects/{id}/pools',response:PoolChoices,query:PoolChoicesQuery,description:'Project view permission; cursor-paged pool choices.'},
  {path:'/api/v1/pools/{id}/entitlements',response:EntitlementPage,query:EntitlementQuery,description:'Project view permission; one branch per cursor-paged request. Null treatment means undecided.'},
  {path:'/api/v1/pools/{id}/view-definition',response:ViewDefinitionResponse,query:ViewDefinitionQuery,description:'Project administer permission. DDL from the pure compiler; no source execution.'},
 ];
 return {openapi:'3.1.0',info:{title:'Entitlement inspection',version:'1'},paths:Object.fromEntries(routes.map(route=>{const query=z.toJSONSchema(route.query);return [route.path,{get:{description:route.description,parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},...Object.entries(query.properties??{}).map(([name,schema])=>({name,in:'query',required:query.required?.includes(name)??false,schema}))],responses:{default:{description:'Standard error envelope',content:{'application/json':{schema:z.toJSONSchema(BulkEntitlementError)}}},'200':{description:'Inspection result',content:{'application/json':{schema:z.toJSONSchema(route.response)}}}}}}];}))};
}
