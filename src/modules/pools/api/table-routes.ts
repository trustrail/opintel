import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {PoolId,ObjectId,ProjectId} from '../../../shared/kernel/index.js';
import {AddPoolTables,SetPoolTableRows,PoolTableResult,PoolTablesPage,BoundPoolTable} from '../../../shared/api/pool-tables.js';
import type {PoolTablesPort} from '../application/tables.js';
export function poolTableRoutes(tables:PoolTablesPort){
 const params=z.object({id:z.uuid()}),objectParams=params.extend({objectId:z.uuid()}),query=z.object({projectId:z.uuid(),cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(50)});
 return [
  defineRoute({method:'GET',path:'/api/v1/pools/:id/tables',params,query,request:z.undefined(),response:PoolTablesPage,permission:{resource:'project',id:r=>r.query.projectId,permission:'view'},handle:async r=>{const saved=await tables.list({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id),r.query.cursor??null,r.query.limit);if(!saved.ok)throw saved.error;return {body:saved.value,headers:{'cache-control':'no-store'}};}}),
  defineRoute({method:'POST',path:'/api/v1/pools/:id/tables',params,request:AddPoolTables,response:PoolTableResult,permission:{resource:'project',id:r=>r.body.projectId,permission:'bind_source'},handle:async r=>{const saved=await tables.add({projectId:ProjectId(r.body.projectId),userId:r.actor.id},PoolId(r.params.id),r.body.tables.map(ObjectId),r.body.rowRule);if(!saved.ok)throw saved.error;return {body:saved.value,headers:{'cache-control':'no-store'}};}}),
  defineRoute({method:'DELETE',path:'/api/v1/pools/:id/tables/:objectId',params:objectParams,request:z.strictObject({projectId:z.uuid()}),response:z.object({removed:z.literal(true)}),permission:{resource:'project',id:r=>r.body.projectId,permission:'bind_source'},handle:async r=>{const saved=await tables.remove({projectId:ProjectId(r.body.projectId),userId:r.actor.id},PoolId(r.params.id),ObjectId(r.params.objectId));if(!saved.ok)throw saved.error;return {body:{removed:true as const}};}}),
  defineRoute({method:'PUT',path:'/api/v1/pools/:id/tables/:objectId/rows',params:objectParams,request:SetPoolTableRows,response:BoundPoolTable,permission:{resource:'project',id:r=>r.body.projectId,permission:'set_entitlement'},handle:async r=>{const saved=await tables.rows({projectId:ProjectId(r.body.projectId),userId:r.actor.id},PoolId(r.params.id),ObjectId(r.params.objectId),r.body.rowRule);if(!saved.ok)throw saved.error;return {body:saved.value,headers:{'cache-control':'no-store'}};}}),
 ];
}
