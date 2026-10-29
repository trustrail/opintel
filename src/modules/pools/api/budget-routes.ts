import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {PoolId,ProjectId} from '../../../shared/kernel/index.js';
import {ChangePoolBudgets,PoolBudgetView} from '../../../shared/api/pool-budgets.js';
import type {PoolBudgetPort} from '../application/budgets.js';
export function poolBudgetRoutes(budgets:PoolBudgetPort){
 const params=z.object({id:z.uuid()});
 return [
  defineRoute({method:'GET',path:'/api/v1/pools/:id/budgets',params,query:z.object({projectId:z.uuid()}),request:z.undefined(),response:PoolBudgetView,permission:{resource:'project',id:r=>r.query.projectId,permission:'view'},handle:async r=>{const result=await budgets.read({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id));if(!result.ok)throw result.error;return {body:result.value,headers:{'cache-control':'no-store'}};}}),
  defineRoute({method:'PATCH',path:'/api/v1/pools/:id/budgets',params,request:ChangePoolBudgets,response:PoolBudgetView,permission:{resource:'project',id:r=>r.body.projectId,permission:'administer'},handle:async r=>{const result=await budgets.change({projectId:ProjectId(r.body.projectId),userId:r.actor.id},PoolId(r.params.id),r.body.budgets);if(!result.ok)throw result.error;return {body:result.value,headers:{'cache-control':'no-store'}};}}),
 ];
}
