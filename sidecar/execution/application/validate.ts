import {DomainError,ElementId,err} from '../../../src/shared/kernel/index.js';
import {validationRequest} from '../../../src/shared/execution-contract.js';
import {DuckDBValidationSessions,validationBudget,type ValidationSessions,type ValidationSession} from '../../session/index.js';
import {validateStatement} from '../../sql/index.js';
import {deadlineClock,executionAudit,type DeadlineClock,type ExecutionAudit} from './ports.js';
/** No source, queue, execution engine or executable prepared handle is available here. */
export class StagedValidator {
 constructor(private readonly sessions:ValidationSessions=new DuckDBValidationSessions(),private readonly clock:DeadlineClock=deadlineClock,private readonly audit:ExecutionAudit=executionAudit){}
 async validate(input:unknown,parent?:AbortSignal){
  const decoded=validationRequest.safeParse(input);
  if(!decoded.success)return err(new DomainError('validation_failed','The execution request does not match the staged query contract.',{cause:'invalid_execution_contract'}));
  const r=decoded.data;
  const controller=new AbortController(),abort=()=>controller.abort();parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
  const started=performance.now();
  const stop=this.clock.after(validationBudget.timeoutMs,abort);
  let session:ValidationSession|undefined;
  const run=async()=>{
   const addresses=r.objects.map(o=>JSON.stringify([o.catalog,o.schema,o.name]));
   if(new Set(addresses).size!==addresses.length||new Set(r.objects.map(o=>`${o.catalog}__${o.schema}__${o.name}`)).size!==r.objects.length||new Set(r.sources.map(s=>s.sourceId)).size!==r.sources.length||r.objects.some(o=>o.catalog!==o.readPlan.catalog||!r.sources.some(s=>s.sourceId===o.sourceId)))return err(new DomainError('validation_failed','The staged source addresses or declarations are inconsistent.',{cause:'invalid_plan',reason:'source_declarations'}));
   if(r.objects.some(o=>o.readPlan.columns.some(c=>!r.entitlements.some(e=>e.elementId===c.elementId&&e.treatment===c.treatment))))return err(new DomainError('sql_not_permitted','The read plan and authoritative entitlements disagree.',{cause:'inspection_inconsistent',reason:'policy'}));
   const decisions=new Map<string,(typeof r.entitlements)[number]>();
   for(const d of r.entitlements){if(decisions.has(d.elementId)&&decisions.get(d.elementId)!.treatment!==d.treatment)return err(new DomainError('validation_failed','Conflicting element treatments.',{cause:'invalid_plan',reason:'conflicting_treatments'}));decisions.set(d.elementId,d);}
   session=await this.sessions.open(r,controller.signal);
   return validateStatement(session,r.sql,{...r.namespace,objects:r.objects.map(o=>({catalog:o.catalog,schema:o.schema,name:o.name}))},{aggregateMinGroupSize:r.aggregateMinGroupSize,readPlan:r.objects.map(o=>({catalog:o.catalog,schema:o.schema,name:o.name,columns:o.readPlan.columns.map(c=>({name:c.exposedName,elementId:ElementId(c.elementId),...(c.token?{tokenDomain:c.token.domain}:{})}))})),entitlements:[...decisions.values()].map(e=>({...e,elementId:ElementId(e.elementId)}))});
  };
  try{
   const result=await run();
   if(controller.signal.aborted||performance.now()-started>=validationBudget.timeoutMs)return err(new DomainError('budget_exceeded','Validation exceeded its fixed 2-second deadline or was cancelled.',{cause:'interruption_unclassified',resource:'time'},true));
   this.audit.record({event:result.ok?'execution.completed':'execution.refused',requestId:r.requestId,projectId:r.projectId,poolId:r.poolId,operation:'validate',...(!result.ok?{reason:result.error.code}:{})});
   return result;
  }catch(error){
   if(controller.signal.aborted||performance.now()-started>=validationBudget.timeoutMs)return err(new DomainError('budget_exceeded','Validation exceeded its fixed 2-second deadline or was cancelled.',{cause:'interruption_unclassified',resource:'time'},true));
   return err(error instanceof DomainError?error:new DomainError('dependency_unavailable','Validation could not complete. No query was executed.'));
  }finally{session?.close();stop();parent?.removeEventListener('abort',abort);}
 }
}
