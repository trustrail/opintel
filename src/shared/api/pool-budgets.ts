import {z} from 'zod';
import {createApiClient} from './client.js';
export const PositivePoolBudget=z.number().int().positive();
/** No numeric defaults: execution still requires an explicitly saved threads budget. */
export const PoolBudgetValues=z.strictObject({
 threads:PositivePoolBudget.optional(),rowsPerRequest:PositivePoolBudget.optional(),
 timeoutMs:PositivePoolBudget.optional(),memoryMb:PositivePoolBudget.optional(),
 concurrency:PositivePoolBudget.optional(),rowsPerDay:PositivePoolBudget.optional(),
});
export type PoolBudgetValues=z.infer<typeof PoolBudgetValues>;
export const PoolBudgetView=z.strictObject({poolId:z.uuid(),budgets:PoolBudgetValues});
export const ChangePoolBudgets=z.strictObject({projectId:z.uuid(),budgets:PoolBudgetValues.refine(v=>Object.keys(v).length>0,'Supply at least one budget to change.')});
export function readPoolBudgets(pool:string,project:string,client=createApiClient()){return client.request({path:`/api/v1/pools/${pool}/budgets?projectId=${encodeURIComponent(project)}`,response:PoolBudgetView});}
export function changePoolBudgets(pool:string,body:z.input<typeof ChangePoolBudgets>,client=createApiClient()){return client.request({method:'PATCH',path:`/api/v1/pools/${pool}/budgets`,body,response:PoolBudgetView});}
export function poolBudgetsOpenApiDocument(){
 const json=(schema:z.ZodType)=>({'application/json':{schema:z.toJSONSchema(schema)}});
 const parameters=[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}];
 const responses={200:{description:'Explicit pool budgets; no suggested or default values',content:json(PoolBudgetView)},default:{description:'Standard error envelope'}};
 return {openapi:'3.1.0',info:{title:'Pool budgets',version:'1'},paths:{'/api/v1/pools/{id}/budgets':{
  get:{'x-permission':'project#view',parameters:[...parameters,{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}}],responses},
  patch:{'x-permission':'project#administer',description:'Merge explicitly supplied positive integers; omitted budgets are unchanged. Changes are audited in the same transaction.',parameters,requestBody:{required:true,content:json(ChangePoolBudgets)},responses},
 }}};
}
