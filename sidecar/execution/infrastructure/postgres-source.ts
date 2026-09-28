import { stagingType } from '../../../src/shared/staging-types.js';
import { z } from 'zod';
import { DomainError,ProjectId,err,ok,type Result } from '../../../src/shared/kernel/index.js';
import { SecretRef } from '../../../src/platform/secrets/index.js';
import { maskValue } from '../../../src/modules/entitlements/index.js';
import { PostgresSourceScope,SourceBusy,SourceCancelled,SourceTimeout } from '../../infrastructure/postgres-source-scope.js';
import { SidecarTokenizer } from '../../tokenize/index.js';
import { canonicalisers } from '../../tokenize/canonicalisers/index.js';
import type { EngineSession } from '../../session/index.js';
import type { Scan,StagingSource } from '../application/ports.js';
import { nativeExpression } from '../application/pushdown.js';
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const selection=(s:Scan,connector=false)=>s.object.readPlan.columns.map(c=>(c.readAs==='text'?quote(c.sourceIdentifier)+'::text':connector&&stagingType(c.exposedType)!.complex?'to_json('+nativeExpression(c)+')::text':nativeExpression(c))+' AS '+quote(c.exposedName)).join(',');
const select=(s:Scan,connector=false)=>`SELECT ${selection(s,connector)} FROM ${quote(s.object.readPlan.schema)}.${quote(s.object.readPlan.object)}${s.predicate?' WHERE '+s.predicate:''}`;
const credential=(s:Scan)=>SecretRef(s.request.sources.find(v=>v.sourceId===s.object.sourceId)!.credentialRef);
const key=(s:Scan)=>s.object.sourceId;
const modes: Readonly<Record<string, string>> = {
  text: 'text', varchar: 'text', bpchar: 'text', uuid: 'text',
  int2: 'number', int4: 'number', int8: 'number', numeric: 'number',
  date: 'date', timestamp: 'timestamp', timestamptz: 'timestamp',
};
const refused = () => err(new DomainError('validation_failed',
  'A source column cannot use its declared tokenization mode. Check the declaration; cast floating-point columns upstream to numeric.',{cause:'invalid_token_declaration',reason:'token_declaration'}));


// Only stable typed driver codes establish these facts. Native scanner text is
// not evidence of reachability and is never searched for a cause.
function sourceFailureCause(error:unknown):string {
 const parsed=z.object({code:z.string()}).safeParse(error);
 if(!parsed.success)return 'unclassified';
 if(['ECONNREFUSED','ENOTFOUND','EHOSTUNREACH','ENETUNREACH'].includes(parsed.data.code))return 'source_unreachable';
 if(parsed.data.code==='57014')return 'interruption_unclassified';
 if(/^[0-9A-Z]{5}$/u.test(parsed.data.code))return 'source_read_failed';
 return 'unclassified';
}
export class PostgresStagingSource implements StagingSource {
 constructor(private readonly scope:PostgresSourceScope,private readonly tokenizer:SidecarTokenizer){}
 private async safe<T>(work:()=>Promise<Result<T>>,responseKind:'metadata'|'data'='data'):Promise<Result<T>>{
  try{return await work();}catch(e){if(e instanceof DomainError)return err(e);
   if(e instanceof Error&&e.message.startsWith('Out of Memory Error:'))return err(new DomainError('budget_exceeded','The pool memory limit was exceeded while staging. Narrow the query or review the pool limit.',{cause:'memory_exhausted',resource:'memory'}));
   if(e instanceof SourceBusy)return err(new DomainError('budget_exceeded','Source connection limit reached.',{cause:'source_connections_saturated'},true));
   return err(new DomainError('source_unavailable',e instanceof SourceTimeout?'The source operation exceeded its deadline.':e instanceof SourceCancelled?'The source operation was cancelled.':'The source read could not complete. No partial result was returned.',{...(e instanceof z.ZodError?{reason:responseKind}:{}),cause:e instanceof SourceTimeout||e instanceof SourceCancelled?'interruption_unclassified':e instanceof z.ZodError?'source_response_unusable':sourceFailureCause(e)}));
  }
 }
 estimate(s:Scan,signal:AbortSignal):Promise<Result<number|null>>{
  return this.safe(()=>this.scope.run(key(s),credential(s),async session=>{
   const known=await session.query('SELECT reltuples::double precision AS rows FROM pg_class WHERE oid=to_regclass($1)',[quote(s.object.readPlan.schema)+'.'+quote(s.object.readPlan.object)]);
   const metadata=z.array(z.object({rows:z.number()})).parse(known);
   if(!metadata.length||metadata[0]!.rows<0)return ok(null);
   const rows=await session.query('EXPLAIN (FORMAT JSON) '+select(s));
   const explained=z.array(z.object({'QUERY PLAN':z.array(z.object({Plan:z.object({'Plan Rows':z.number().nonnegative()})})).min(1)})).min(1).parse(rows);
   return ok(explained[0]!['QUERY PLAN'][0]!.Plan['Plan Rows']);
  },signal),'metadata');
 }
 plain(s:Scan,privileged:EngineSession,table:string,signal:AbortSignal):Promise<Result<void>>{
  return this.safe(()=>this.scope.external(key(s),credential(s),async (connection,sourceSignal)=>{
   if(!privileged.staging)throw new Error('Staging unavailable');
   const abort=()=>privileged.interrupt?.();sourceSignal.addEventListener('abort',abort,{once:true});
   try{await privileged.staging.materialize(connection,select(s)+` LIMIT ${s.request.settings.maxStagingRows+1}`,table,s.object.readPlan.columns.map(c=>({name:c.exposedName,type:c.exposedType})));return ok(undefined);}finally{sourceSignal.removeEventListener('abort',abort);}
  },signal));
 }
 treated(s:Scan,consume:(rows:unknown[][])=>Promise<Result<void>>,signal:AbortSignal):Promise<Result<void>>{
  const read=async(transforms:((value:unknown)=>Result<unknown>)[]):Promise<Result<void>>=>this.safe(()=>this.scope.run(key(s),credential(s),async session=>{
   await session.query("SELECT set_config('TimeZone','UTC',true),set_config('DateStyle','ISO, YMD',true)");
        const types = z.array(z.object({ name: z.string(), type: z.string() })).parse(await session.query(`
          WITH RECURSIVE types AS (
            SELECT a.attname AS name, t.oid, t.typname, t.typbasetype
            FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
            WHERE a.attrelid=pg_catalog.to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped
            UNION ALL SELECT types.name,t.oid,t.typname,t.typbasetype
            FROM types JOIN pg_catalog.pg_type t ON t.oid=types.typbasetype
          ) SELECT name,typname AS type FROM types WHERE typbasetype=0`,
          [`${quote(s.object.readPlan.schema)}.${quote(s.object.readPlan.object)}`]));
        for (const column of s.object.readPlan.columns.filter(c=>c.treatment==='tokenized')) {
          const type = types.find(type => type.name === column.sourceIdentifier)?.type;
          const expected = column.token!.epochUnit ? 'number' : column.token!.mode;
          if (type === undefined || modes[type] !== expected) return refused();
        }

   await session.query('DECLARE opintel_stage NO SCROLL CURSOR FOR '+select(s,true)+` LIMIT ${s.request.settings.maxStagingRows+1}`);
   try{for(;;){
    if(signal.aborted)throw new SourceCancelled();
    const raw=await session.query('FETCH FORWARD 256 FROM opintel_stage');
    const rows=z.array(z.record(z.string(),z.unknown())).parse(raw);
    if(!rows.length)break;
    const treated:unknown[][]=[];
    try{
     for(const row of rows){const output:unknown[]=[];for(const [i,c] of s.object.readPlan.columns.entries()){
      const v=transforms[i]!(row[c.exposedName]);if(!v.ok)return v;output.push(v.value);
     }treated.push(output);for(const k of Object.keys(row))row[k]=null;}
     if(signal.aborted)throw new SourceCancelled();const accepted=await consume(treated);if(!accepted.ok)return accepted;
    }finally{for(const row of raw)if(typeof row==='object'&&row!==null)for(const k of Object.keys(row))Reflect.set(row,k,null);for(const row of rows)for(const k of Object.keys(row))row[k]=null;for(const row of treated)row.fill(null);treated.length=0;}
   }return ok(undefined);}finally{await session.query('CLOSE opintel_stage');}
  },signal));
  const base=s.object.readPlan.columns.map(c=>(value:unknown):Result<unknown>=>c.treatment==='masked'?maskValue(c.mask!.kind,value):ok(value));
  if(!s.object.readPlan.columns.some(c=>c.treatment==='tokenized'))return read(base);
  return this.tokenizer.run(ProjectId(s.request.projectId),async run=>{
   for(const [i,c] of s.object.readPlan.columns.entries())if(c.treatment==='tokenized'){
    const config=c.token!,registered=canonicalisers.get(config.canonId);
    if(!registered||registered.mode!==config.mode)return err(new DomainError('validation_failed','The read plan names an unavailable canonicaliser.',{cause:'invalid_token_declaration',reason:'canonicaliser'}));
    const builtin=['stdtext1','stdnum1','stddate1','stdtime1'].includes(config.canonId);
    const transform=run.prepare(config,builtin?undefined:registered);if(!transform.ok)return transform;base[i]=transform.value;
   }
   return read(base);
  });
 }
}
