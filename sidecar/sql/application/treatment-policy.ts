import { z } from 'zod';
import { DomainError, ElementId, err, ok, type Result } from '../../../src/shared/kernel/index.js';
import { foldIdentifier as fold, type PoolNamespace } from './subset.js';
const identifier=z.string().min(1).refine(v=>!v.includes('\0'));
const elementId=z.uuid().transform(v=>ElementId(v));
export const treatmentPolicySchema=z.strictObject({
 aggregateMinGroupSize:z.number().int().positive(),
 readPlan:z.array(z.strictObject({catalog:identifier,schema:identifier,name:identifier,
  columns:z.array(z.strictObject({name:identifier,elementId,tokenDomain:z.string().regex(/^[a-z0-9]+$/).optional()}))})),
 entitlements:z.array(z.strictObject({elementId,treatment:z.enum(['clear','masked','tokenized','aggregate_only','withheld'])})),
});
export type TreatmentPolicy=z.infer<typeof treatmentPolicySchema>;
export type PolicyTable={catalog:string;schema:string;name:string;columns:{name:string;elementId:ElementId;treatment:'clear'|'masked'|'tokenized'|'aggregate_only';tokenDomain?:string}[]};
const address=(v:{catalog:string;schema:string;name:string})=>JSON.stringify([v.catalog,v.schema,v.name].map(fold));
export function resolvePolicy(input:unknown,namespace:PoolNamespace):Result<{policy:TreatmentPolicy;tables:PolicyTable[]}>{
 const parsed=treatmentPolicySchema.safeParse(input);
 const failure=()=>err(new DomainError('sql_not_permitted','The pool read plan and a decision for every staged column are required.',{cause:'inspection_inconsistent',reason:'policy'}));
 if(!parsed.success)return failure();
 const policy=parsed.data,decisions=new Map(policy.entitlements.map(e=>[e.elementId,e.treatment]));
 if(decisions.size!==policy.entitlements.length||new Set(policy.readPlan.map(address)).size!==policy.readPlan.length)return failure();
 if(policy.readPlan.length!==namespace.objects.length||namespace.objects.some(o=>!policy.readPlan.some(p=>address(p)===address(o))))return failure();
 const tables:PolicyTable[]=[];
 for(const table of policy.readPlan){
  const columns:PolicyTable['columns']=[];
  if(new Set(table.columns.map(c=>fold(c.name))).size!==table.columns.length||new Set(table.columns.map(c=>c.elementId)).size!==table.columns.length)return failure();
  for(const column of table.columns){
   const treatment=decisions.get(column.elementId);
   if(!treatment||treatment==='withheld'||(treatment==='tokenized')!==Boolean(column.tokenDomain))return failure();
   columns.push({...column,treatment});
  }
  tables.push({...table,columns});
 }
 return ok({policy,tables});
}
