import {withTenant,type Tx} from '../../../platform/db/scope.js';
import {DomainError,err,ok,type PoolId} from '../../../shared/kernel/index.js';
import {PoolBudgetValues} from '../../../shared/api/pool-budgets.js';
import type {PoolKeyContext} from '../application/keys.js';
import type {PoolBudgetPort} from '../application/budgets.js';
export async function auditPoolBudgets(tx:Tx,ctx:PoolKeyContext,pool:PoolId,before:PoolBudgetValues,after:PoolBudgetValues){
 await tx.query("INSERT INTO audit_entry(project_id,actor_id,actor_kind,action,target,before,after) VALUES($1,$2,'user','PoolBudgetsChanged',$3,$4,$5)",[ctx.projectId,ctx.userId,{poolId:pool},before,after]);
}
export class PostgresPoolBudgets implements PoolBudgetPort{
 read(ctx:PoolKeyContext,pool:PoolId){return withTenant(ctx,async tx=>{const [row]=await tx.query<{budgets:unknown}>('SELECT budgets FROM pool WHERE id=$1',[pool]);return row?ok({poolId:pool,budgets:PoolBudgetValues.parse(row.budgets)}):err(new DomainError('not_found','The pool was not found in this project.'));});}
 change(ctx:PoolKeyContext,pool:PoolId,budgets:PoolBudgetValues){
  const input=PoolBudgetValues.safeParse(budgets);
  if(!input.success||Object.keys(input.data).length===0)return Promise.resolve(err(new DomainError('validation_failed','Supply positive integer pool budgets to change.')));
  return withTenant(ctx,async tx=>{
   const [row]=await tx.query<{budgets:unknown}>('SELECT budgets FROM pool WHERE id=$1 FOR UPDATE',[pool]);
   if(!row)return err(new DomainError('not_found','The pool was not found in this project.'));
   const before=PoolBudgetValues.parse(row.budgets),after={...before,...input.data};
   if(Object.entries(input.data).some(([name,value])=>before[name as keyof PoolBudgetValues]!==value)){
    await tx.query('UPDATE pool SET budgets=$2 WHERE id=$1',[pool,after]);
    await auditPoolBudgets(tx,ctx,pool,before,after);
   }
   return ok({poolId:pool,budgets:after});
  });
 }
}
