import {z} from 'zod';
import {DomainError,err,ok,type Result} from '../../../src/shared/kernel/index.js';
import type {ValidationSession,InspectionObserver} from '../../session/index.js';
import {inspectSubset,namespaceSchema,foldIdentifier,type PoolNamespace} from './subset.js';
import {resolvePolicy} from './treatment-policy.js';
import {inspectTreatments} from './treatments.js';
import {queryEngineBuild} from './engine-build.js';
const equalObject=(a:PoolNamespace['objects'][number],b:PoolNamespace['objects'][number])=>foldIdentifier(a.catalog)===foldIdentifier(b.catalog)&&foldIdentifier(a.schema)===foldIdentifier(b.schema)&&foldIdentifier(a.name)===foldIdentifier(b.name);
export async function validateStatement(session:ValidationSession,sql:string,input:PoolNamespace,policyInput:unknown,observe?:InspectionObserver){
 const namespace=namespaceSchema.parse(input);z.string().parse(sql);
   const inspection=session;
   const version=await inspection.build();
   if(version!==queryEngineBuild)return err(new DomainError('sql_not_permitted','The parser and engine build do not match the inspected grammar.',{cause:'parser_engine_mismatch',queryEngineVersion:version}));
   const parsed=await inspection.parse(sql);
   if(parsed.kind!=='parsed')return err(new DomainError('sql_not_permitted',
    parsed.kind==='parse_failed'?'The engine could not parse this statement.':'The parsed statement cannot be serialized by this engine and is not permitted.',
    {cause:parsed.kind,proofCategory:parsed.kind,queryEngineVersion:version}));
   const report=<T>(tree:unknown,result:Result<T>):Result<T>=>{
    observe?.({stage:'inspected',tree,permitted:result.ok,...(!result.ok&&typeof result.error.details?.construct==='string'?{construct:result.error.details.construct}:{})});
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

   if(!await parsed.bind()){
    const construct=z.object({statements:z.array(z.object({node:z.object({type:z.string()})}))}).parse(parsed.tree).statements[0]!.node.type;
    return err(new DomainError('sql_not_permitted',`Construct ${construct} is not permitted: a column was not found or an identifier is unavailable or ambiguous in the pool.`,{cause:'binding_failed',construct,proofCategory:'sql_not_permitted',stage:'binding',queryEngineVersion:version}));
   }
   return ok({queryEngineVersion:version,treatmentEvidence:{aggregateMinGroupSize:policy.aggregateMinGroupSize,stage2Required:treatment.value.aggregate!==undefined,stage2Ran:false}});
}
