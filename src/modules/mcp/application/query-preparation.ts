import type { z } from 'zod';
import { QueryInput } from '../../../shared/api/mcp.js';
import { validationRequest } from '../../../shared/execution-contract.js';
import { DomainError, err, ok, type ElementId } from '../../../shared/kernel/index.js';
import { QueryPreFilter, type ViewDefinition } from '../../entitlements/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { McpPrincipal } from './access.js';
import type { QuerySnapshotReader, QueryExecutionPort } from './query-ports.js';
import type {EvidencePlan} from '../../evidence/index.js';
import type { Reduction } from './response.js';

/** Shared preparation is a pre-filter, never authorization. Both callers must
 * send the independent read plan and entitlements to the sidecar. */
export class QueryPreparation {
 constructor(private readonly reader:QuerySnapshotReader,private readonly filter:QueryPreFilter,private readonly execution:Pick<QueryExecutionPort,'health'>,private readonly authorization:AuthorizationPort) {}
 async prepare(principal:McpPrincipal,input:z.infer<typeof QueryInput>,requestId:string,signal?:AbortSignal,capture?:(plan:EvidencePlan)=>void) {
   const snapshot=await this.reader.read(principal);if(!snapshot.ok)return err(snapshot.error);
   const s=snapshot.value;
   const evidence:EvidencePlan|undefined=s.evidence?{requiresTokenization:false,versions:{...s.evidence.versions},elements:[],sources:[],sourcePlan:{executionSettings:{...(s.limits?{limits:s.limits}:{}),settings:s.settings,aggregateMinGroupSize:s.aggregateMinGroupSize}},stages:[]}:undefined;
   if(evidence)capture?.(evidence);
   const health=await this.execution.health(signal);if(!health.ok)return err(health.error);
   const touched:ViewDefinition[]=[];const returned=new Set<ElementId>();
   const filterStarted=performance.now();
   const filtered=await this.filter.inspect({sql:input.sql,queryEngineBuild:health.value.queryEngineVersion,views:s.compilation.views,omitted:s.compilation.omitted},v=>{if(!touched.includes(v))touched.push(v);},ids=>{for(const id of ids)returned.add(id);});
   if(evidence&&s.evidence){
    evidence.sources=s.evidence.sources.filter(source=>touched.some(v=>s.sources.find(s=>s.id===source.id)?.alias===v.catalog));
    const tokenized=touched.some(v=>v.readPlan.columns.some(c=>c.treatment==='tokenized'));
    evidence.requiresTokenization=tokenized;
    evidence.versions={...evidence.versions,tokenKeyVersionSelected:tokenized?s.evidence.currentTokenKeyVersion:null};
    evidence.sourcePlan={...evidence.sourcePlan,queryEngineVersion:health.value.queryEngineVersion,objects:touched.map(v=>({catalog:v.catalog,schema:v.schema,name:v.name,columns:v.columns.map(c=>({elementId:c.elementId,exposedName:c.exposedName,state:c.state,treatment:c.treatment}))})),sources:evidence.sources};
    for(const v of touched)for(const c of v.columns){
     if(c.exposedName===null)continue;
     if(c.state==='withheld'||c.state==='undecided')evidence.elements.push({elementId:c.elementId,exposedName:c.exposedName,state:c.state,treatment:null,withheldReason:c.state==='withheld'?(s.evidence.withheldReasons?.[c.elementId]??'Withheld by the pool policy.'):'No entitlement decision exists.'});
     else if(returned.has(c.elementId)&&c.treatment!==null&&c.treatment!=='withheld')evidence.elements.push({elementId:c.elementId,exposedName:c.exposedName,state:c.treatment==='aggregate_only'?'aggregated':'released',treatment:c.treatment,withheldReason:null});
    }
   }
   if(!filtered.ok)return err(filtered.error);
   if(evidence)evidence.stages.push({stage:'validate',result:'ok',detail:null,ms:Math.max(0,Math.round(performance.now()-filterStarted))});
   const sources=s.sources.filter(source=>touched.some(v=>v.catalog===source.alias));
   const resolveStarted=performance.now();
   const checks=sources.length?await this.authorization.checkMany(sources.map(source=>({resource:{type:'datasource',id:source.id},permission:'reachable',subject:{type:'pool',id:principal.pool.id}}))):[];
   if(sources.some((_,i)=>!checks[i]?.allowed))return err(new DomainError('sql_not_permitted','A referenced source is not bound to this pool.',{cause:'source_not_bound'}));
   if(sources.some(source=>source.status!=='connected'||source.credentialRef===null))return err(new DomainError('source_unavailable','A referenced source is unavailable. No cached or partial result was returned.',{cause:'source_not_ready',reason:sources.some(source=>source.status!=='connected')?(sources.some(source=>source.credentialRef===null)?'source_status_and_credential_missing':'source_status'):'credential_missing'},true));
   if(evidence)evidence.stages.push({stage:'resolve_sources',result:'ok',detail:{checks:checks.map((check,i)=>({sourceId:sources[i]!.id,allowed:check.allowed,token:check.token,checkedAt:check.checkedAt,snapshotAgeMs:check.snapshotAgeMs}))},ms:Math.max(0,Math.round(performance.now()-resolveStarted))});
   const first=touched[0];
   const request=validationRequest.safeParse({requestId,tokenKeyVersionSelected:evidence?.versions.tokenKeyVersionSelected??null,projectId:principal.pool.projectId,poolId:principal.pool.id,sql:input.sql,policyVersion:s.policyVersion,
    namespace:{catalog:first?.catalog??'memory',schema:first?.schema??'main'},
    sources:sources.map(source=>({sourceId:source.id,credentialRef:source.credentialRef})),
    objects:touched.map(v=>({catalog:v.catalog,schema:v.schema,name:v.name,sourceId:s.sources.find(source=>source.alias===v.catalog)?.id,readPlan:{...v.readPlan,columns:v.readPlan.columns.map(c=>({...c,elementId:v.columns.find(column=>column.exposedName===c.exposedName)?.elementId}))}})),
    entitlements:touched.flatMap(v=>v.columns.filter(c=>c.state==='emitted').map(c=>({elementId:c.elementId,treatment:c.treatment}))),aggregateMinGroupSize:s.aggregateMinGroupSize,settings:s.settings,
    limits:s.limits?{...s.limits,rowLimit:Math.min(input.maxRows??s.limits.rowLimit,s.limits.rowLimit)}:undefined,entitlementContext:null});
   if(!request.success)return err(new DomainError('dependency_unavailable','The pool read plan or execution settings are incomplete.',{cause:'component_configuration',reason:'read_plan'}));
   const reduction:Reduction={withheld:[],tokenized:[],masked:[],aggregate_only:[]};
   // Compilation is already ordered by object address and source ordinal.
   for(const view of s.compilation.views.filter(v=>touched.includes(v)))for(const column of view.columns){
    if(column.exposedName===null||column.state==='undecided')continue;
    if(column.state==='withheld')reduction.withheld.push(column.exposedName);
    else if(returned.has(column.elementId)&&column.treatment!==null&&column.treatment!=='clear'&&column.treatment!=='withheld')reduction[column.treatment].push(column.exposedName);
   }
   return ok({executionNotes:s.executionNotes??[],request:request.data,queryEngineVersion:health.value.queryEngineVersion,reduction});
 }
}
