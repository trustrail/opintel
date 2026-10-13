import {custodyAvailability} from '../../release-custody/index.js';
import {withTenant} from '../../../platform/db/scope.js';
import {rowPreviewRequest} from '../../../shared/row-preview-contract.js';
import {executionSettings} from '../../../shared/execution-contract.js';
import {readSetting} from '../../../shared/project-settings.js';
import {parsePredicate,hasScope,predicateHash,normalise,referencedColumns} from '../../../shared/row-predicate.js';
import {DomainError,err,ok,type RunId} from '../../../shared/kernel/index.js';
import type {RowPreview,RowPreviewEngine} from '../application/row-preview.js';
import type {EvidenceWriterPort,EvidencePlan} from '../../evidence/index.js';
import {PostgresRowDecisions} from './row-decisions.js';
import {PostgresEntitlementReader} from './entitlement-read.js';
export class PostgresRowPreview implements RowPreview{
 constructor(private readonly engine:RowPreviewEngine,private readonly evidence:EvidenceWriterPort){}
 async run(...[ctx,pool,object,expression,level]:Parameters<RowPreview['run']>){
  const principal={pool:{id:pool,projectId:ctx.projectId},scopeUserId:ctx.userId,agentId:'console-preview',keyPrefix:'console-preview'};
  let receipt:RunId|undefined,plan:EvidencePlan|undefined;
  const begin=async()=>{if(receipt)return ok(receipt);const opened=await this.evidence.open(principal,'/* Privileged row entitlement preview */ SELECT 1',plan);if(opened.ok)receipt=opened.value;return opened;};
  const refuse=async(error:DomainError)=>{const opened=await begin();if(!opened.ok)return opened;const saved=await this.evidence.close(opened.value,{kind:'refused',code:error.code,message:error.message,details:{preview:true,actorId:ctx.userId,objectId:object,poolId:pool},plan,tokenKeyVersionUsed:null,sourceIdsReached:[]},principal);return saved.ok?err(error):saved;};
  try{
   const read=await new PostgresRowDecisions().read(ctx,pool,object);if(!read.ok)return refuse(read.error);
   const draft=parsePredicate(expression,read.value.columns);if(!draft.ok)return refuse(draft.error);if(hasScope(draft.value))return refuse(new DomainError('validation_failed','scope references arrive in step 3'));
   const other=level==='object_default'?read.value.current:read.value.objectDefault;
   const otherPredicate=other?parsePredicate(other.expression,read.value.columns):null;if(otherPredicate&&!otherPredicate.ok)return refuse(otherPredicate.error);
   const predicate=normalise(otherPredicate?.ok?{kind:'and',terms:[draft.value,otherPredicate.value]}:draft.value),hash=predicateHash(predicate);
   const compilation=await new PostgresEntitlementReader().compilation(ctx,pool);if(!compilation.ok)return refuse(compilation.error);const s=compilation.value;
   const [catalog]=await withTenant(ctx,tx=>tx.query<{catalog:string;schema:string;name:string;sourceId:string;orderBy:string[];budgets:{threads:number;rowsPerRequest?:number;timeoutMs?:number;memoryMb?:number;concurrency?:number}}>(`SELECT s.exposed_alias AS catalog,o.exposed_schema AS schema,o.exposed_name AS name,s.id AS "sourceId",p.budgets,ARRAY(SELECT e.source_identifier FROM catalog_element e WHERE e.object_id=o.id AND e.status='active' ORDER BY e.ordinal) AS "orderBy" FROM catalog_object o JOIN data_source s ON s.id=o.source_id JOIN pool_source_binding b ON b.source_id=s.id JOIN pool p ON p.id=b.pool_id WHERE o.id=$1 AND p.id=$2`,[object,pool]));
   if(!catalog)return refuse(new DomainError('not_found','The object is not bound to this pool.'));
   const view=s.compilation.views.find(v=>v.catalog===catalog.catalog&&v.schema===catalog.schema&&v.name===catalog.name);
   if(!view)return refuse(new DomainError('sql_not_permitted','This pool has no returned columns on the object. No sample rows can be previewed.'));
   const source=s.sources.find(v=>v.id===catalog.sourceId);if(!source||source.status!=='connected'||!source.credentialRef)return refuse(new DomainError('source_unavailable','The preview source is unavailable.'));
   const columns=read.value.columns.filter(c=>referencedColumns(predicate).includes(c.id));
   plan={requiresTokenization:view.readPlan.columns.some(c=>c.treatment==='tokenized'),versions:{...s.evidence.versions,tokenKeyVersionSelected:view.readPlan.columns.some(c=>c.treatment==='tokenized')?s.evidence.currentTokenKeyVersion:null},elements:[],sources:s.evidence.sources.filter(v=>v.id===catalog.sourceId),stages:[],sourcePlan:{rowPreview:{actorId:ctx.userId,objectId:object,poolId:pool,predicateHash:hash,time:new Date().toISOString()}}};
   const opened=await begin();if(!opened.ok)return opened;
   const q=(name:string)=>Number(readSetting(s.projectSettings,'query.'+name)),b=catalog.budgets;
   const input=rowPreviewRequest.safeParse({requestId:opened.value,projectId:ctx.projectId,poolId:pool,policyVersion:s.policyVersion,tokenKeyVersionSelected:s.evidence.currentTokenKeyVersion,sql:'SELECT 1',namespace:{catalog:catalog.catalog,schema:catalog.schema},sources:[{sourceId:catalog.sourceId,credentialRef:source.credentialRef}],objects:[{catalog:catalog.catalog,schema:catalog.schema,name:catalog.name,sourceId:catalog.sourceId,readPlan:{...view.readPlan,rowScope:{objectId:object,poolId:pool,decisionId:other?.id??null,hash,columns,predicate,pushdown:false},columns:view.readPlan.columns.map(c=>({...c,elementId:view.columns.find(e=>e.exposedName===c.exposedName)!.elementId}))}}],entitlements:view.columns.filter(c=>c.state==='emitted').map(c=>({elementId:c.elementId,treatment:c.treatment})),aggregateMinGroupSize:q('aggregateMinGroupSize'),settings:executionSettings.parse({maxStagingRows:readSetting(s.projectSettings,'query.maxStagingRows'),maxQueuedExecutions:readSetting(s.projectSettings,'query.maxQueuedExecutions')}),limits:{memoryMb:Math.min(b.memoryMb??q('memoryLimitMb'),q('memoryLimitMb')),threads:b.threads,timeoutMs:Math.min(b.timeoutMs??q('timeoutSeconds')*1000,q('timeoutSeconds')*1000),rowLimit:5,concurrency:Math.min(b.concurrency??q('concurrencyPerPool'),q('concurrencyPerPool'))},entitlementContext:null,orderBy:catalog.orderBy});
   if(!input.success)return refuse(new DomainError('validation_failed','Configure valid query limits and pool budgets before previewing.'));
   if(view.readPlan.columns.some(c=>c.treatment==='custody')){const custody=await custodyAvailability(ctx.projectId);if(!custody.available)return refuse(new DomainError('dependency_unavailable','Custody provider unavailable. Configure a custody provider in Settings.',{cause:'release_configuration',reason:custody.reason}));}
   const response=await this.engine.preview(input.data,undefined,ctx);if(!response.ok)return refuse(response.error);
   const saved=await this.evidence.close(opened.value,{kind:'answered',rows:response.value.rows.length,policyVersion:s.policyVersion,queryEngineVersion:'row-preview',plan,tokenKeyVersionUsed:plan.requiresTokenization?s.evidence.currentTokenKeyVersion:null,sourceIdsReached:[source.id]},principal);
   return saved.ok?ok(response.value):saved;
  }catch{return refuse(new DomainError('dependency_unavailable','The row preview could not complete. No sample was released.'));}
 }
}
