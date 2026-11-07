import {validationProgress} from '../../../src/shared/engine-phase.js';
import {stagedColumns} from '../../../src/shared/execution-contract.js';
import type {ValidationRequest} from '../../../src/shared/execution-contract.js';
import type {InspectionObserver,StatementObserver} from '../ports.js';
import type {ValidationSessions,ValidationSession} from '../validation.js';
import {DuckDBSessionEngine} from './duckdb.js';
import {harden} from './harden.js';
// Parser implementation properties, never project settings or wire overrides.
export const validationBudget=Object.freeze({memoryMb:128,threads:1,timeoutMs:2000});
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export class DuckDBValidationSessions implements ValidationSessions {
 constructor(private readonly statements?:StatementObserver,private readonly inspection?:InspectionObserver){}
 async open(request:ValidationRequest,signal:AbortSignal):Promise<ValidationSession>{
  const progress=<T>(stage:import('../../../src/shared/engine-phase.js').ValidationStage,work:()=>Promise<T>)=>validationProgress(request.requestId,stage,work);
  const agent=await progress('duckdb_open',()=>new DuckDBSessionEngine(this.statements,this.inspection,undefined,validationBudget,progress).open('agent'));
  const abort=()=>agent.interrupt?.();signal.addEventListener('abort',abort);
  const close=()=>{signal.removeEventListener('abort',abort);agent.close();};
  try{
   if(signal.aborted)throw new Error('Interrupt Error: Cancelled');
   if(!agent.staging||!agent.inspection)throw new Error('Validation inspection unavailable.');
   await progress('namespace',()=>agent.staging!.namespace(request.namespace.catalog,request.namespace.schema));
   for(const o of request.objects)await progress('table_create',()=>agent.staging!.create(o.catalog,o.schema,o.name,stagedColumns(o.readPlan)));
   await progress('search_path',()=>agent.execute("SET search_path='"+(quote(request.namespace.catalog)+'.'+quote(request.namespace.schema)).replaceAll("'","''")+"'"));
   await progress('harden',()=>harden(agent,'agent',validationBudget));
   if(signal.aborted)throw new Error('Interrupt Error: Cancelled');
   const inspection=agent.inspection;
   // The native prepared handle is destroyed here. It is never returned to validation.
   return {build:()=>progress('build',()=>inspection.build()),columns:()=>progress('columns',()=>inspection.columns()),objects:()=>progress('objects',()=>inspection.objects()),hasExternalState:c=>progress('external_state',()=>inspection.hasExternalState(c)),close,
    parse:async sql=>{const parsed=await progress('parse',()=>inspection.parse(sql));if(parsed.kind!=='parsed')return parsed;
     return {kind:'parsed',tree:parsed.tree,bind:async()=>{const prepared=await progress('prepare',()=>parsed.prepare());if(prepared.kind!=='bound')return false;prepared.handle.close();return true;}};},
   };
  }catch(error){close();throw error;}
 }
}
