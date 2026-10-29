import {z} from 'zod';
import {createApiClient} from './client.js';
export const PoolRowRule=z.union([
 z.strictObject({column:z.string().min(1).max(63),operator:z.enum(['=','<>','<','<=','>','>=']),value:z.union([z.string().max(1024),z.number().finite().refine(v=>!Number.isInteger(v)||Number.isSafeInteger(v),'Integer rule values must be exactly representable.'),z.boolean(),z.null()])}),
 z.strictObject({allRows:z.literal(true)}),
]);
export type PoolRowRule=z.infer<typeof PoolRowRule>;
export const PoolStartingMode=z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('nothing_yet')}),z.strictObject({kind:z.literal('copy_from'),poolId:z.uuid()})]);
export const PoolTableSetup=z.strictObject({tables:z.array(z.uuid()).min(1).max(50).refine(v=>new Set(v).size===v.length,'Choose each table once.'),rowRule:PoolRowRule,startingMode:PoolStartingMode});
export type PoolTableSetup=z.infer<typeof PoolTableSetup>;
export const BoundPoolTable=z.strictObject({objectId:z.uuid(),sourceId:z.uuid(),name:z.string(),needsRows:z.boolean(),reason:z.enum(['column_missing','incompatible_type','rule_required']).nullable(),copiedColumns:z.number().int().nonnegative().optional(),skippedColumns:z.number().int().nonnegative().optional()});
export const PoolTableResult=z.strictObject({poolId:z.uuid(),tables:z.array(BoundPoolTable)});
export const PoolTablesPage=z.strictObject({items:z.array(BoundPoolTable),nextCursor:z.uuid().nullable()});
export const AddPoolTables=z.strictObject({projectId:z.uuid(),tables:PoolTableSetup.shape.tables,rowRule:PoolRowRule.optional()});
export const SetPoolTableRows=z.strictObject({projectId:z.uuid(),rowRule:PoolRowRule});
export function addPoolTables(pool:string,body:z.input<typeof AddPoolTables>,client=createApiClient()){return client.request({method:'POST',path:`/api/v1/pools/${pool}/tables`,body,response:PoolTableResult});}
export function removePoolTable(pool:string,object:string,projectId:string,client=createApiClient()){return client.request({method:'DELETE',path:`/api/v1/pools/${pool}/tables/${object}`,body:{projectId},response:z.object({removed:z.literal(true)})});}
export function setPoolTableRows(pool:string,object:string,body:z.input<typeof SetPoolTableRows>,client=createApiClient()){return client.request({method:'PUT',path:`/api/v1/pools/${pool}/tables/${object}/rows`,body,response:BoundPoolTable});}
export function poolTablesOpenApiDocument(){
 const json=(schema:z.ZodType)=>({'application/json':{schema:z.toJSONSchema(schema)}});
 const op=(request:z.ZodType|undefined,response:z.ZodType,permission:string)=>({description:`Requires project#${permission}. Table selection never grants unscoped row access.`,...request?{requestBody:{required:true,content:json(request)}}:{},responses:{200:{description:'Saved table decision',content:json(response)},default:{description:'Standard error envelope'}}});
 return {openapi:'3.1.0',info:{title:'Pool table bindings',version:'1'},paths:{
  '/api/v1/pools/{id}/tables':{post:op(AddPoolTables,PoolTableResult,'bind_source'),get:op(undefined,PoolTablesPage,'view')},
  '/api/v1/pools/{id}/tables/{objectId}':{delete:op(z.strictObject({projectId:z.uuid()}),z.object({removed:z.literal(true)}),'bind_source')},
  '/api/v1/pools/{id}/tables/{objectId}/rows':{put:op(SetPoolTableRows,BoundPoolTable,'set_entitlement')},
 }};
}
