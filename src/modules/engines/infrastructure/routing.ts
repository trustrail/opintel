import type {z} from 'zod';
import {DomainError,err,ok,type ProjectId,type Result,type SourceId,type ElementId} from '../../../shared/kernel/index.js';
import type {ExecutionRequest,ValidationRequest,executionResponse,validationResponse} from '../../../shared/execution-contract.js';
import {SidecarQueryExecution,type QueryExecutionPort,type QueryValidationPort} from '../../mcp/index.js';
import {SidecarCustodyClient,type CustodyPort,type CanonicaliserCatalog} from '../../entitlements/index.js';
import {SidecarSourceConnector,type SourceConnectorContext,type SourceConnector,type DemoProvisioningPort} from '../../sources/index.js';
import type {SecretRef} from '../../../platform/secrets/index.js';
import type {CustodyOperation,CustodyResponse,custodyOperations} from '../../../shared/custody-contract.js';
import {withTenant} from '../../../platform/db/scope.js';
import type {EngineRegistry,EngineContext} from '../application/registry.js';
export type QueryEngineContext=EngineContext&{sources:SourceId[];parserOnly?:boolean};
export class RegistryQueryExecution implements QueryExecutionPort,QueryValidationPort {
 constructor(private readonly registry:EngineRegistry,private readonly repository?:import('../application/registry.js').EngineRepository){}
 async health(signal?:AbortSignal,ctx?:QueryEngineContext){
  if(!ctx)return err(new DomainError('source_unavailable','Query engine routing requires a project and source context.'));
  if(!ctx.sources.length){const e=await this.registry.forCustody(ctx);return e.ok?new SidecarQueryExecution(e.value).health(signal):e;}
  let firstFailure:DomainError|undefined;let version:string|undefined;
  for(const id of ctx.sources){const e=await this.registry.forSource(ctx,id);if(!e.ok){if(!ctx.parserOnly)return e;firstFailure??=e.error;continue;}const h=await new SidecarQueryExecution(e.value).health(signal);if(!h.ok){if(!ctx.parserOnly)return h;firstFailure??=h.error;continue;}if(ctx.parserOnly)return h;if(version&&version!==h.value.queryEngineVersion)return err(new DomainError('sql_not_permitted','The engines report different query builds. Align their builds before querying.'));version=h.value.queryEngineVersion;}
  return version?ok({queryEngineVersion:version}):err(firstFailure??new DomainError('source_unavailable','No verified engine is available for these sources.'));
 }

 private async client(input:ValidationRequest,ctx?:EngineContext){
  if(!ctx||ctx.projectId!==input.projectId)return err(new DomainError('forbidden','Query engine project context is missing or inconsistent.'));
  const ids=[...new Set(input.sources.map(s=>s.sourceId as SourceId))];
  let endpoint:import('../application/registry.js').EngineEndpoint|undefined;
  for(const id of ids){const tokenized=input.objects.some(o=>o.sourceId===id&&o.readPlan.columns.some(c=>c.treatment==='tokenized'));const result=await this.registry.forSource(ctx,id,tokenized);if(!result.ok)return result;if(endpoint&&endpoint.baseUrl!==result.value.baseUrl)return err(new DomainError('sources_cannot_be_joined','This query references sources served by different engines. Run separate queries; cross-engine execution is not supported.'));endpoint=result.value;}
  if(!endpoint){const result=await this.registry.forCustody(ctx);if(!result.ok)return result;endpoint=result.value;}
  return ok(new SidecarQueryExecution(endpoint));
 }
 async execute(input:ExecutionRequest,signal?:AbortSignal,ctx?:EngineContext):Promise<Result<z.infer<typeof executionResponse>>>{const c=await this.client(input,ctx);if(!c.ok)return c;const tokenized=input.objects.some(o=>o.readPlan.columns.some(c=>c.treatment==='tokenized'));if(tokenized){if(!ctx||!this.repository)return err(new DomainError('source_unavailable','Tokenized execution requires registered key metadata.'));const key=await this.repository.key(ctx);if(!key||key.version!==input.tokenKeyVersionSelected)return err(new DomainError('source_unavailable','The project token key changed while preparing this query. Prepare the query again.'));return c.value.execute({...input,expectedTokenSentinel:key.sentinel},signal);}return c.value.execute(input,signal);}
 async validate(input:ValidationRequest,signal?:AbortSignal,ctx?:EngineContext):Promise<Result<z.infer<typeof validationResponse>>>{const c=await this.client(input,ctx);return c.ok?c.value.validate(input,signal):c;}
}
export class RegistryCustodyClient implements CustodyPort,CanonicaliserCatalog {
 constructor(private readonly registry:EngineRegistry){}
 async call<K extends CustodyOperation>(project:ProjectId,operation:K,payload:z.input<(typeof custodyOperations)[K]['request']>,ctx?:EngineContext):Promise<Result<CustodyResponse<K>>>{if(!ctx||ctx.projectId!==project)return err(new DomainError('source_unavailable','Custody engine routing requires the project context.'));const started=performance.now();const e=await this.registry.forCustody(ctx);if(!e.ok)return e;const remaining=9000-Math.ceil(performance.now()-started);return remaining>0?new SidecarCustodyClient({...e.value,timeoutMs:remaining}).call(project,operation,payload):err(new DomainError('source_unavailable','Custody engine connection timed out.'));}
 async canonicalisers(ctx?:EngineContext,element?:ElementId):Promise<Result<readonly string[]>>{if(!ctx||!element)return err(new DomainError('source_unavailable','Canonicaliser discovery requires the element source context.'));const [source]=await withTenant(ctx,tx=>tx.query<{id:SourceId}>('SELECT o.source_id AS id FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id WHERE e.id=$1',[element]));if(!source)return err(new DomainError('not_found','Catalogue element not found.'));const e=await this.registry.forSource(ctx,source.id);return e.ok?new SidecarCustodyClient(e.value).canonicalisers():e;}
}
export function registryConnector(registry:EngineRegistry,ctx:EngineContext,context:SourceConnectorContext,engineId?:import('../../../shared/kernel/index.js').EngineId):SourceConnector&DemoProvisioningPort {
 const get=()=>engineId?registry.forEngine(ctx,engineId):registry.forSource(ctx,context.sourceId);
 const call=async<T>(work:(c:SidecarSourceConnector)=>Promise<Result<T>>):Promise<Result<T>>=>{const started=performance.now();const e=await get();if(!e.ok)return e;const remaining=9000-Math.ceil(performance.now()-started);return remaining>0?work(new SidecarSourceConnector('postgres',context,{...e.value,timeoutMs:remaining})):err(new DomainError('source_unavailable','Engine routing exceeded the source operation deadline.'));};
 return {kind:'postgres',testConnection:(ref:SecretRef,signal?:AbortSignal)=>call(c=>c.testConnection(ref,signal)),introspect:(ref,include,signal)=>call(c=>c.introspect(ref,include,signal)),sampleTopValues:(ref,elements,limit,signal)=>call(c=>c.sampleTopValues(ref,elements,limit,signal)),estimateRowCount:(ref,object,signal)=>call(c=>c.estimateRowCount(ref,object,signal)),provisionDemo:(ref,payload,signal)=>call(c=>c.provisionDemo(ref,payload,signal))};
}
