import {QueryInput,QueryOutput} from '../../../shared/api/mcp.js';
import {executionRequest} from '../../../shared/execution-contract.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import {QueryPreFilter,type ViewDefinition} from '../../entitlements/index.js';
import type {AuthorizationPort} from '../../authz/index.js';
import type {McpPrincipal} from './access.js';
import type {EvidenceWriterPort,QuerySnapshotReader,QueryExecutionPort,QueryTool} from './query-ports.js';
export function assertEvidenceWriter(writer:EvidenceWriterPort,build=process.env.NODE_ENV){
 if(writer.implementation==='test-stub'&&build!=='test')throw new Error('A test EvidenceWriterPort must not be installed in a non-test build. Wire items 5.10 and 5.11.');
}
export class QueryService implements QueryTool {
 constructor(private readonly reader:QuerySnapshotReader,private readonly filter:QueryPreFilter,private readonly execution:QueryExecutionPort,private readonly authorization:AuthorizationPort,private readonly evidence:EvidenceWriterPort){assertEvidenceWriter(evidence);}
 async query(principal:McpPrincipal,input:unknown,signal?:AbortSignal){
  const parsed=QueryInput.safeParse(input);if(!parsed.success)return err(new DomainError('validation_failed','The query arguments do not match their schema.'));
  // Nothing may execute unless opening its record succeeds. Production's
  // unavailable writer stops here, before compilation, parsing or source I/O.
  const opened=await this.evidence.open(principal,parsed.data.sql);if(!opened.ok)return opened;
  const id=opened.value;
  const finish=async(outcome:Parameters<EvidenceWriterPort['close']>[1])=>{try{return await this.evidence.close(id,outcome);}catch{return err(new DomainError('dependency_unavailable','Evidence could not be recorded. No query result was released.'));}};
  const refused=async(error:DomainError)=>{const saved=await finish({kind:'refused',code:error.code});const failure=saved.ok?error:saved.error;return err(new DomainError(failure.code,failure.message,{...failure.details,evidenceId:id},failure.retryable));};
  try{
   const snapshot=await this.reader.read(principal);if(!snapshot.ok)return refused(snapshot.error);
   const s=snapshot.value;
   const health=await this.execution.health(signal);if(!health.ok)return refused(health.error);
   const touched:ViewDefinition[]=[];
   const filtered=await this.filter.inspect({sql:parsed.data.sql,queryEngineBuild:health.value.queryEngineVersion,views:s.compilation.views,omitted:s.compilation.omitted},v=>{if(!touched.includes(v))touched.push(v);});
   if(!filtered.ok)return refused(filtered.error);
   const sources=s.sources.filter(source=>touched.some(v=>v.catalog===source.alias));
   const checks=sources.length?await this.authorization.checkMany(sources.map(source=>({resource:{type:'datasource',id:source.id},permission:'reachable',subject:{type:'pool',id:principal.pool.id}}))):[];
   if(sources.some((_,i)=>!checks[i]?.allowed))return refused(new DomainError('sql_not_permitted','A referenced source is not bound to this pool.'));
   if(sources.some(source=>source.status!=='connected'||source.credentialRef===null))return refused(new DomainError('source_unavailable','A referenced source is unavailable. No cached or partial result was returned.',undefined,true));
   const first=touched[0];
   const request=executionRequest.safeParse({requestId:id,projectId:principal.pool.projectId,poolId:principal.pool.id,sql:parsed.data.sql,policyVersion:s.policyVersion,
    namespace:{catalog:first?.catalog??'memory',schema:first?.schema??'main'},
    sources:sources.map(source=>({sourceId:source.id,credentialRef:source.credentialRef})),
    objects:touched.map(v=>({catalog:v.catalog,schema:v.schema,name:v.name,sourceId:s.sources.find(source=>source.alias===v.catalog)?.id,readPlan:{...v.readPlan,columns:v.readPlan.columns.map(c=>({...c,elementId:v.columns.find(column=>column.exposedName===c.exposedName)?.elementId}))}})),
    entitlements:touched.flatMap(v=>v.columns.filter(c=>c.state==='emitted').map(c=>({elementId:c.elementId,treatment:c.treatment}))),aggregateMinGroupSize:s.aggregateMinGroupSize,settings:s.settings,
    limits:{...s.limits,rowLimit:Math.min(parsed.data.maxRows??s.limits.rowLimit,s.limits.rowLimit)},entitlementContext:null});
   if(!request.success)return refused(new DomainError('dependency_unavailable','The pool read plan or execution settings are incomplete.'));
   // requires_sidecar_inspection is not authorization. No pre-filter outcome
   // is sent to the sidecar; it receives independent plans and entitlements.
   const response=await this.execution.execute(request.data,signal);if(!response.ok)return refused(response.error);
   const r=response.value;
   if(r.queryEngineVersion!==health.value.queryEngineVersion||r.policyVersion!==s.policyVersion||r.columnTypes.length!==r.columns.length||r.rows.some(row=>row.length!==r.columns.length))return refused(new DomainError('dependency_unavailable','The sidecar returned an inconsistent query result.'));
   const output=QueryOutput.safeParse({columns:r.columns.map((name,i)=>({name,type:r.columnTypes[i]})),rows:r.rows,truncated:r.truncated,evidenceId:id});
   if(!output.success)return refused(new DomainError('dependency_unavailable','The query result does not match its contract.'));
   const saved=await finish({kind:'answered',rows:r.rows.length,policyVersion:r.policyVersion,queryEngineVersion:r.queryEngineVersion});
   return saved.ok?ok(output.data):err(new DomainError(saved.error.code,saved.error.message,{...saved.error.details,evidenceId:id},saved.error.retryable));
  }catch{return refused(new DomainError('dependency_unavailable','The query could not complete. No partial result was returned.'));}
 }
}
