import { z } from 'zod';
import { DomainError, err, ok, type Result } from '../../../src/shared/kernel/index.js';
import { TwoSessionExecutor, type SessionEngine, type EngineSession, type SessionLimits, type SessionRows, type InspectionObserver } from '../../session/index.js';
import { inspectSubset, namespaceSchema, foldIdentifier, type PoolNamespace } from './subset.js';
import { resolvePolicy } from './treatment-policy.js';
import { inspectTreatments } from './treatments.js';
import { withRowLimit } from './row-limit.js';
import { aggregateRefusal, supportsEstimate, withGroupCount, validGroupCount } from './cardinality.js';

import {queryEngineBuild} from './engine-build.js';
export {queryEngineBuild} from './engine-build.js';
export type TreatmentEvidence={aggregateMinGroupSize:number;stage2Required:boolean;stage2Ran:boolean};
export type InspectedRows=SessionRows&{queryEngineVersion:string;treatmentEvidence:TreatmentEvidence;truncated?:boolean};
const equalObject=(a:PoolNamespace['objects'][number],b:PoolNamespace['objects'][number])=>
 foldIdentifier(a.catalog)===foldIdentifier(b.catalog)&&foldIdentifier(a.schema)===foldIdentifier(b.schema)&&foldIdentifier(a.name)===foldIdentifier(b.name);

/** Authoritative checks use this session's tree and prepared handle. The
 * namespace, read plan and decisions are trusted request metadata, never agent input. */
export class InspectedSessionExecutor {
 private readonly sessions:TwoSessionExecutor;
 constructor(engine?:SessionEngine,private readonly observe?:InspectionObserver){this.sessions=new TwoSessionExecutor(engine);}
 execute(sql:string,limits:SessionLimits,input:PoolNamespace,policy?:unknown,options:{rowLimit?:number;signal?:AbortSignal;stage?:(privileged:EngineSession,agent:EngineSession)=>Promise<Result<void>>}={}):Promise<Result<InspectedRows>>{
  return this.run(sql,limits,input,policy,true,options);
 }
 async validate(sql:string,limits:SessionLimits,input:PoolNamespace,policy:unknown):Promise<Result<{queryEngineVersion:string;treatmentEvidence:TreatmentEvidence}>>{
  const result=await this.run(sql,limits,input,policy,false);
  return result.ok?ok({queryEngineVersion:result.value.queryEngineVersion,treatmentEvidence:result.value.treatmentEvidence}):result;
 }
 private async run(sql:string,limits:SessionLimits,input:PoolNamespace,policyInput:unknown,execute:boolean,options:{rowLimit?:number;signal?:AbortSignal;stage?:(privileged:EngineSession,agent:EngineSession)=>Promise<Result<void>>}={}):Promise<Result<InspectedRows>>{
  try{
  const namespace=namespaceSchema.parse(input);z.string().parse(sql);
  return await this.sessions.withAgent(limits,async agent=>{
   const inspection=agent.inspection;
   if(!inspection)return err(new DomainError('sql_not_permitted','This engine does not provide authoritative SQL inspection.',{cause:'inspection_unavailable'}));
   const version=await inspection.build();
   if(version!==queryEngineBuild)return err(new DomainError('sql_not_permitted','The parser and engine build do not match the inspected grammar.',{cause:'parser_engine_mismatch',queryEngineVersion:version}));
   let parsed=await inspection.parse(sql);
   if(parsed.kind!=='parsed')return err(new DomainError('sql_not_permitted',
    parsed.kind==='parse_failed'?'The engine could not parse this statement.':'The parsed statement cannot be serialized by this engine and is not permitted.',
    {cause:parsed.kind,proofCategory:parsed.kind,queryEngineVersion:version}));
   const report=<T>(tree:unknown,result:Result<T>):Result<T>=>{
    this.observe?.({stage:'inspected',tree,permitted:result.ok,...(!result.ok&&typeof result.error.details?.construct==='string'?{construct:result.error.details.construct}:{})});
    return result;
   };
   const permitted=report(parsed.tree,inspectSubset(parsed.tree,namespace));if(!permitted.ok)return permitted;
   const objects=await inspection.objects();
   if(await inspection.hasExternalState(['memory',namespace.catalog,...namespace.objects.map(o=>o.catalog)])||objects.some(object=>!namespace.objects.some(allowed=>equalObject(object,allowed)))){
    return err(new DomainError('sql_not_permitted','The agent session contains objects outside the pool namespace.',{cause:'inspection_inconsistent',reason:'namespace'}));
   }
   const resolved=resolvePolicy(policyInput,namespace);if(!resolved.ok)return resolved;
   const {policy,tables}=resolved.value;
   const columns=await inspection.columns();
   if(tables.some(t=>{
    const actual=columns.filter(c=>equalObject(c,t));
    return actual.length!==t.columns.length||actual.some(c=>!t.columns.some(p=>foldIdentifier(p.name)===foldIdentifier(c.column)));
   }))return err(new DomainError('sql_not_permitted','The staged columns do not match the pool read plan.',{cause:'inspection_inconsistent',reason:'staged_schema'}));
   const treatment=inspectTreatments(parsed.tree,namespace,policy,tables);if(!treatment.ok)return report(parsed.tree,treatment);
   const aggregate=treatment.value.aggregate;
   let stage2=false;
   if(aggregate){
    const estimate=supportsEstimate(parsed.tree)?await inspection.estimate(sql):null;
    const supported=estimate!==null&&Number.isFinite(estimate)&&estimate>=0;
    const passed=!supported||estimate>=aggregate.threshold;
    stage2=!supported||estimate<=2*aggregate.threshold;
    this.observe?.({stage:'cardinality',phase:1,threshold:aggregate.threshold,estimate:supported?estimate:null,passed,counted:false});
    if(!passed)return report(parsed.tree,err(aggregateRefusal(aggregate,1)));
   }
   const evidence:TreatmentEvidence={aggregateMinGroupSize:policy.aggregateMinGroupSize,stage2Required:stage2,stage2Ran:false};
   if(stage2){
    // Tree transformation only. Reparse, reinspect and bind the transformed
    // statement; no original-text execution and no uninspected generated SQL.
    const counted=withGroupCount(parsed.tree,tables.flatMap(t=>t.columns.map(c=>c.name)));
    const rendered=await inspection.render(counted);
    parsed=await inspection.parse(rendered);
    if(parsed.kind!=='parsed')return err(new DomainError('sql_not_permitted','The internal group-count statement could not be inspected.',{cause:'inspection_inconsistent',reason:'group_count_rewrite'}));
    const subset=report(parsed.tree,inspectSubset(parsed.tree,namespace));if(!subset.ok)return subset;
    const treatments=inspectTreatments(parsed.tree,namespace,policy,tables);if(!treatments.ok)return report(parsed.tree,treatments);
   }
   if(options.rowLimit!==undefined){
    const limit=z.number().int().positive().max(2147483646).parse(options.rowLimit);
    const rendered=await inspection.render(withRowLimit(parsed.tree,limit+1));
    parsed=await inspection.parse(rendered);
    if(parsed.kind!=='parsed')return err(new DomainError('sql_not_permitted','The bounded statement could not be inspected.',{cause:'inspection_inconsistent',reason:'row_limit_rewrite'}));
    const subset=report(parsed.tree,inspectSubset(parsed.tree,namespace));if(!subset.ok)return subset;
    const treatment=inspectTreatments(parsed.tree,namespace,policy,tables);if(!treatment.ok)return report(parsed.tree,treatment);
   }
   const preparation=await parsed.prepare();
   if(preparation.kind==='unresolved'){
    const construct=z.object({statements:z.array(z.object({node:z.object({type:z.string()})}))}).parse(parsed.tree).statements[0]!.node.type;
    this.observe?.({stage:'inspected',tree:parsed.tree,permitted:false,construct});
    return err(new DomainError('sql_not_permitted',`Construct ${construct} is not permitted: a column was not found or an identifier is unavailable or ambiguous in the pool.`,{cause:'binding_failed',construct,proofCategory:'sql_not_permitted',stage:'binding',queryEngineVersion:version}));
   }
   const handle=preparation.handle;
   try{
    const boundCheck=report(parsed.tree,inspectSubset(parsed.tree,namespace));if(!boundCheck.ok)return boundCheck;
    const boundTreatment=inspectTreatments(parsed.tree,namespace,policy,tables);if(!boundTreatment.ok)return report(parsed.tree,boundTreatment);
    if(!execute)return ok({columns:[],rows:[],queryEngineVersion:version,treatmentEvidence:evidence});
    const rows=await handle.execute();
    if(stage2&&aggregate){
     const passed=rows.rows.every(row=>row.length===rows.columns.length&&validGroupCount(row.at(-1),aggregate.threshold));
     this.observe?.({stage:'cardinality',phase:2,threshold:aggregate.threshold,estimate:null,passed,counted:true});
     if(!passed)return err(aggregateRefusal(aggregate,2,rows.rows.some(row=>row.length!==rows.columns.length||!validGroupCount(row.at(-1),0))));
     rows.columns.pop();rows.columnTypes?.pop();for(const row of rows.rows)row.pop();evidence.stage2Ran=true;
    }
    const truncated=options.rowLimit!==undefined&&rows.rows.length>options.rowLimit;
    if(truncated)rows.rows.length=options.rowLimit!;
    return ok({...rows,queryEngineVersion:version,treatmentEvidence:evidence,...(options.rowLimit!==undefined?{truncated}:{})});
   }finally{handle.close();}
  },options.signal,options.stage?async(privileged,agent)=>{const staged=await options.stage!(privileged,agent);return staged.ok?undefined:staged;}:undefined);
  }catch(error){
   if(error instanceof DomainError)return err(error);
   if(error instanceof z.ZodError)return err(new DomainError('validation_failed','The query request or engine response did not match its required contract.',{cause:'invalid_execution_contract'}));
   return err(this.sessions.failure(error));
  }
 }
}
