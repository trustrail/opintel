import {rowPreviewRequest,rowPreviewResponse} from '../../../src/shared/row-preview-contract.js';
import {resultSealer} from '../../../src/shared/infrastructure/sealed-result.js';
import {hasScope,predicateHash,referencedColumns} from '../../../src/shared/row-predicate.js';
import {DomainError,err,ok,ProjectId,PoolId} from '../../../src/shared/kernel/index.js';
import type {StagingSource} from './ports.js';
import type {ExecutionQueue} from './queue.js';
/** Internal mTLS operation; never an agent query or a treatment-policy bypass. */
export async function previewRows(input:unknown,source:StagingSource,queue:ExecutionQueue,parent?:AbortSignal){
 const decoded=rowPreviewRequest.safeParse(input);if(!decoded.success)return err(new DomainError('validation_failed','Invalid row preview request.'));
 const r=decoded.data,o=r.objects[0];
 if(r.objects.length!==1||!o||r.sources.length!==1||o.sourceId!==r.sources[0]?.sourceId||o.catalog!==o.readPlan.catalog||o.readPlan.columns.some(c=>!r.entitlements.some(e=>e.elementId===c.elementId&&e.treatment===c.treatment)))return err(new DomainError('validation_failed','The preview read plan is inconsistent.'));
 const scope=o.readPlan.rowScope;
 if(scope&&(scope.poolId!==r.poolId||scope.predicate!==null&&(hasScope(scope.predicate)||predicateHash(scope.predicate)!==scope.hash||referencedColumns(scope.predicate).some(id=>!scope.columns.some(c=>c.id===id)))))return err(new DomainError('validation_failed','The preview row predicate is inconsistent.'));
 const signal=AbortSignal.any([...(parent?[parent]:[]),AbortSignal.timeout(r.limits.timeoutMs)]);
 const acquired=await queue.acquire(ProjectId(r.projectId),PoolId(r.poolId),r.limits.concurrency,r.settings.maxQueuedExecutions,signal);if(!acquired.ok)return acquired;
 let total=0,entitled=0;
 const samples:unknown[][]=[],columns=o.readPlan.columns,visible=columns.flatMap((c,i)=>c.treatment==='aggregate_only'?[]:[i]);
 const custodyIndices=visible.flatMap((i,index)=>columns[i]!.treatment==='custody'?[index]:[]);
 const sealer=custodyIndices.length?resultSealer(visible.map(i=>columns[i]!.exposedName),custodyIndices,r.requestId):undefined;
 try{
  // No pushdown for preview: count all rows and apply the same predicate before
  // transformation. Hidden scope inputs never reach the consumer.
  const object={...o,readPlan:{...o.readPlan,...scope?{rowScope:{...scope,pushdown:false}}:{}}};
  const checked=await source.estimate({request:r,object,predicate:null},signal);if(!checked.ok)return checked;
  const result=await source.treated({request:r,object,predicate:null,preview:{orderBy:r.orderBy,scanned:()=>{total++;}}},async rows=>{
   for(const row of rows){entitled++;if(samples.length>=5||!visible.length)continue;
    const sample=visible.map(i=>row[i]);samples.push(sealer?sealer.seal(sample,samples.length):sample);
   }return ok(undefined);
  },signal);
  if(!result.ok)return result;
  const aggregateColumns=columns.filter(c=>c.treatment==='aggregate_only').map(c=>c.exposedName),belowThreshold=visible.length===0&&aggregateColumns.length>0&&entitled<r.aggregateMinGroupSize;
  return ok(rowPreviewResponse.parse({total,entitled:belowThreshold?null:entitled,belowThreshold,columns:visible.map(i=>columns[i]!.exposedName),rows:samples,aggregateColumns,custodyColumns:columns.filter(c=>c.treatment==='custody').map(c=>c.exposedName),receiptId:r.requestId}));
 }finally{sealer?.close();acquired.value();}
}
