import {executionRequest} from '../../../shared/execution-contract.js';
import type {EvidencePlan} from '../../evidence/index.js';
import {z} from 'zod';
import {QueryPreparation} from './query-preparation.js';
import {QueryInput,QueryOutput} from '../../../shared/api/mcp.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import {QueryPreFilter} from '../../entitlements/index.js';
import type {AuthorizationPort} from '../../authz/index.js';
import type {McpPrincipal} from './access.js';
import type {EvidenceWriterPort,QuerySnapshotReader,QueryExecutionPort,QueryTool} from './query-ports.js';
export function assertEvidenceWriter(writer:EvidenceWriterPort,build=process.env.NODE_ENV){
 if(writer.implementation==='test-stub'&&build!=='test')throw new Error('A test EvidenceWriterPort must not be installed in a non-test build. Install the durable evidence writer.');
}
export class QueryService implements QueryTool {
 private readonly preparation:QueryPreparation;
 constructor(reader:QuerySnapshotReader,filter:QueryPreFilter,private readonly execution:QueryExecutionPort,authorization:AuthorizationPort,private readonly evidence:EvidenceWriterPort){assertEvidenceWriter(evidence);this.preparation=new QueryPreparation(reader,filter,execution,authorization);}
 async query(principal:McpPrincipal,input:unknown,signal?:AbortSignal){
  const parsed=QueryInput.safeParse(input);if(!parsed.success)return err(new DomainError('validation_failed','The query arguments do not match their schema.',{cause:'invalid_query'}));
  let captured:EvidencePlan|undefined;
  const started=performance.now();
  let prepared;
  try{prepared=await this.preparation.prepare(principal,parsed.data,'preparing',signal,plan=>{captured=plan;});}
  catch{prepared=err(new DomainError('dependency_unavailable','The query could not complete. No partial result was returned.'));}
  // Preparation contacts no source. Open commits before execute can begin.
  let opened;
  try{opened=await this.evidence.open(principal,parsed.data.sql,captured);}catch{return err(new DomainError('dependency_unavailable','Evidence could not be opened. No query was executed.',{cause:'evidence_before_execution'}));}
  if(!opened.ok)return err(new DomainError(opened.error.code,opened.error.message,{...opened.error.details,cause:'evidence_before_execution'},opened.error.retryable));
  const id=opened.value;let progress:'before'|'unknown'|'after'='before';
  const evidenceFailure=(error:DomainError)=>new DomainError(error.code,error.message,{...error.details,cause:progress==='before'?'evidence_before_execution':progress==='after'?'evidence_after_execution':'evidence_execution_unknown',evidenceId:id},error.retryable);
  const finish=async(outcome:Parameters<EvidenceWriterPort['close']>[1])=>{try{return await this.evidence.close(id,{...outcome,plan:captured,elapsedMs:Math.max(0,Math.round(performance.now()-started))},principal);}catch{return err(new DomainError('dependency_unavailable','Evidence could not be recorded. No query result was released.'));}};
  let usage:{tokenKeyVersionUsed:number|null;sourceIdsReached:string[]}={tokenKeyVersionUsed:null,sourceIdsReached:[]};
  const refused=async(error:DomainError)=>{const saved=await finish({kind:'refused',code:error.code,message:error.message,details:error.details,stage:progress==='before'?(['source_not_bound','source_not_ready'].includes(String(error.details?.cause))?'resolve_sources':'validate'):'execute',retryable:error.retryable,...usage});const failure=saved.ok?error:evidenceFailure(saved.error);return err(new DomainError(failure.code,failure.message,{...failure.details,evidenceId:id},failure.retryable));};
  try{
   if(!prepared.ok)return refused(prepared.error);
   const plan=prepared.value;plan.request.requestId=id;
   // requires_sidecar_inspection is not authorization. No pre-filter outcome
   // is sent to the sidecar; it receives independent plans and entitlements.
   const executable=executionRequest.safeParse(plan.request);
   if(!executable.success)return refused(new DomainError('validation_failed','The configured query limits are invalid.',{cause:'invalid_settings',reason:'query_limits'}));
   progress='unknown';
   const response=await this.execution.execute(executable.data,signal);if(!response.ok){
    const proof=response.error.details?.proofCategory;
    const reported=z.object({tokenKeyVersionUsed:z.number().int().positive().nullable(),sourceIdsReached:z.array(z.string())}).safeParse(response.error.details);
    if(reported.success)usage=reported.data;
    else return err(new DomainError(response.error.code,response.error.message,{...response.error.details,evidenceId:id},response.error.retryable));
    if(proof==='aggregate_stage2')progress='after';
    else if(proof==='parse_failed'||proof==='serialization_refused'||proof==='sql_not_permitted')progress='before';
    return refused(response.error);
   }
   progress='after';
   const r=response.value;usage={tokenKeyVersionUsed:r.tokenKeyVersionUsed,sourceIdsReached:r.sourceIdsReached};
   if(r.queryEngineVersion!==plan.queryEngineVersion||r.policyVersion!==plan.request.policyVersion||r.columnTypes.length!==r.columns.length||r.rows.some(row=>row.length!==r.columns.length))return refused(new DomainError('dependency_unavailable','The Opintel Engine returned an inconsistent query result.',{cause:'inconsistent_result',reason:r.queryEngineVersion!==plan.queryEngineVersion?'engine_version':r.policyVersion!==plan.request.policyVersion?'policy_version':r.columnTypes.length!==r.columns.length?'column_types':'row_shape'}));
   const output=QueryOutput.safeParse({columns:r.columns.map((name,i)=>({name,type:r.columnTypes[i]})),rows:r.rows,truncated:r.truncated,evidenceId:id});
   if(!output.success)return refused(new DomainError('dependency_unavailable','The query result does not match its contract.',{cause:'inconsistent_result',reason:'result_contract'}));
   const saved=await finish({kind:'answered',rows:r.rows.length,policyVersion:r.policyVersion,queryEngineVersion:r.queryEngineVersion,truncated:r.truncated,...usage,execution:{executionPath:r.executionPath,queryEngineVersion:r.queryEngineVersion,...r.treatmentEvidence}});
   return saved.ok?ok({...output.data,reduction:plan.reduction}):err(evidenceFailure(saved.error));
  }catch{return err(new DomainError('dependency_unavailable','The query could not complete. Its evidence remains incomplete; no result was released.',{evidenceId:id}));}
 }
}
