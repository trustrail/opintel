import { z } from 'zod';
import { DomainError, err, ok, type Result } from '../../../src/shared/kernel/index.js';
import { TwoSessionExecutor, type SessionEngine, type SessionLimits, type SessionRows, type InspectionObserver } from '../../session/index.js';
import { inspectSubset, namespaceSchema, foldIdentifier, type PoolNamespace } from './subset.js';

export const queryEngineBuild='v1.4.3/d1dc88f950';
export type InspectedRows=SessionRows&{queryEngineVersion:string};
const equalObject=(a:PoolNamespace['objects'][number],b:PoolNamespace['objects'][number])=>
 foldIdentifier(a.catalog)===foldIdentifier(b.catalog)&&foldIdentifier(a.schema)===foldIdentifier(b.schema)&&foldIdentifier(a.name)===foldIdentifier(b.name);

/** S2c only. The supplied namespace comes from trusted pool configuration, not
 * agent SQL. No treatment decision, staging or HTTP route is implemented here. */
export class InspectedSessionExecutor {
 private readonly sessions:TwoSessionExecutor;
 constructor(engine?:SessionEngine,private readonly observe?:InspectionObserver){this.sessions=new TwoSessionExecutor(engine);}
 async execute(sql:string,limits:SessionLimits,input:PoolNamespace):Promise<Result<InspectedRows>>{
  const namespace=namespaceSchema.parse(input);z.string().parse(sql);
  return this.sessions.withAgent(limits,async agent=>{
   const inspection=agent.inspection;
   if(!inspection)return err(new DomainError('sql_not_permitted','This engine does not provide authoritative SQL inspection.'));
   const version=await inspection.build();
   if(version!==queryEngineBuild)return err(new DomainError('sql_not_permitted','The parser and engine build do not match the inspected grammar.',{queryEngineVersion:version}));
   const parsed=await inspection.parse(sql);
   if(parsed.kind!=='parsed')return err(new DomainError('sql_not_permitted',
    parsed.kind==='parse_failed'?'The engine could not parse this statement.':'The parsed statement cannot be serialized by this engine and is not permitted.',
    {proofCategory:parsed.kind,queryEngineVersion:version}));
   const check=()=>{
    const result=inspectSubset(parsed.tree,namespace);
    this.observe?.({stage:'inspected',tree:parsed.tree,permitted:result.ok,...(!result.ok&&typeof result.error.details?.construct==='string'?{construct:result.error.details.construct}:{})});
    return result;
   };
   const permitted=check();if(!permitted.ok)return permitted;
   // No other user table/view may exist: successful binding then proves that
   // referenced objects are pool objects. Trusted staging supplies these later.
   const objects=await inspection.objects();
   if(await inspection.hasExternalState(['memory',namespace.catalog,...namespace.objects.map(o=>o.catalog)])||objects.some(object=>!namespace.objects.some(allowed=>equalObject(object,allowed)))){
    return err(new DomainError('sql_not_permitted','The agent session contains objects outside the pool namespace.'));
   }
   const preparation=await parsed.prepare();
   if(preparation.kind==='unresolved'){
    // Do not return native suggestions or SQL excerpts. The statement passed
    // syntax inspection; PREPARE now proves unresolved/ambiguous binding fails.
    const construct=z.object({statements:z.array(z.object({node:z.object({type:z.string()})}))}).parse(parsed.tree).statements[0]!.node.type;
    this.observe?.({stage:'inspected',tree:parsed.tree,permitted:false,construct});
    return err(new DomainError('sql_not_permitted',`Construct ${construct} is not permitted: a column was not found or an identifier is unavailable or ambiguous in the pool.`,{construct,proofCategory:'sql_not_permitted',stage:'binding',queryEngineVersion:version}));
   }
   const handle=preparation.handle;
   try{
    // Retain post-binding inspection too; no rewrite or text execution follows.
    const boundCheck=check();if(!boundCheck.ok)return boundCheck;
    const rows=await handle.execute();
    return ok({...rows,queryEngineVersion:version});
   }finally{handle.close();}
  });
 }
}
