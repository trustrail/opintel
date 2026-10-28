import {getSourceFailure,retainSourceFailure} from '../../../src/shared/source-failure.js';
import {sourceOperationEvent} from '../../../src/shared/infrastructure/source-trace.js';
import {enginePhase} from '../../../src/shared/engine-phase.js';
import {createHmac,randomBytes} from 'node:crypto';
import {stagedColumns} from '../../../src/shared/execution-contract.js';
import {evaluatePredicate,family} from '../../../src/shared/row-predicate.js';
import {postgresRowPredicate,postgresPredicateInput} from './postgres-row-predicate.js';
import { exactDefaultNumeric } from '../application/exact-numeric.js';
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
const scopeAlias=(s:Scan,id:string)=>{let alias="__scope_"+id;while(s.object.readPlan.columns.some(c=>c.exposedName===alias))alias="_"+alias;return alias;};
const selection=(s:Scan,connector=false)=>s.object.readPlan.columns.map(c=>(c.numericDefault==='array'?'to_json('+quote(c.sourceIdentifier)+'::numeric[]::text[])::text':c.numericDefault==='scalar'?quote(c.sourceIdentifier)+'::numeric::text':c.readAs==='text'?quote(c.sourceIdentifier)+'::text':connector&&stagingType(c.exposedType)!.complex?'to_json('+nativeExpression(c)+')::text':nativeExpression(c))+' AS '+quote(c.exposedName)).join(',');
const select=(s:Scan,connector=false)=>{
 const scope=s.object.readPlan.rowScope;
 const contributor=s.object.readPlan.contributor;
 const proof=contributor?[quote(contributor.sourceIdentifier)+'::text AS '+quote(contributor.internalName)]:[];
 const inputs=scope&&!scope.pushdown?scope.columns.map(c=>postgresPredicateInput(c)+' AS '+quote(scopeAlias(s,c.id))):[];
 const filters=[s.predicate,scope?.predicate&&scope.pushdown?postgresRowPredicate(scope.predicate,scope.columns):undefined].filter(Boolean);
 return `SELECT ${[selection(s,connector),...inputs,...proof].join(',')} FROM ${quote(s.object.readPlan.schema)}.${quote(s.object.readPlan.object)}${filters.length?' WHERE '+filters.map(p=>'('+p+')').join(' AND '):''}`;
};
const credential=(s:Scan)=>SecretRef(s.request.sources.find(v=>v.sourceId===s.object.sourceId)!.credentialRef);
const key=(s:Scan)=>s.object.sourceId;
const modes: Readonly<Record<string, string>> = {
  text: 'text', varchar: 'text', bpchar: 'text', name: 'text', char: 'text', uuid: 'text',
  int2: 'number', int4: 'number', int8: 'number', numeric: 'number', money: 'number',
  date: 'date', timestamp: 'timestamp', timestamptz: 'timestamp',
};
const refused = () => err(new DomainError('validation_failed',
  'A source column cannot use its declared tokenization mode. Check the declaration; cast floating-point columns upstream to numeric.',{cause:'invalid_token_declaration',reason:'token_declaration'}));


// Only stable typed driver codes establish these facts. Native scanner text is
// not evidence of reachability and is never searched for a cause.
function sourceFailureCause(error:unknown):string {
 const parsed=z.object({code:z.string()}).safeParse(error);
 if(!parsed.success)return getSourceFailure(error)?'source_read_failed':'unclassified';
 if(['ECONNREFUSED','ENOTFOUND','EHOSTUNREACH','ENETUNREACH'].includes(parsed.data.code))return 'source_unreachable';
 if(parsed.data.code==='57014')return getSourceFailure(error)?'source_operation_cancelled':'interruption_unclassified';
 if(/^[0-9A-Z]{5}$/u.test(parsed.data.code))return 'source_read_failed';
 return getSourceFailure(error)?'source_read_failed':'unclassified';
}
export class PostgresStagingSource implements StagingSource {
 constructor(private readonly scope:PostgresSourceScope,private readonly tokenizer:SidecarTokenizer){}
 private async safe<T>(work:()=>Promise<Result<T>>,responseKind:'metadata'|'data'='data'):Promise<Result<T>>{
  try{return await work();}catch(e){if(e instanceof DomainError)return err(e);
   if(e instanceof Error&&e.message.startsWith('Out of Memory Error:'))return err(new DomainError('budget_exceeded','The pool memory limit was exceeded while staging. Narrow the query or review the pool limit.',{cause:'memory_exhausted',resource:'memory'}));
   if(e instanceof SourceBusy)return err(new DomainError('budget_exceeded','Source connection limit reached.',{cause:'source_connections_saturated'},true));
   return err(new DomainError('source_unavailable',e instanceof SourceTimeout?'The source operation exceeded its deadline.':e instanceof SourceCancelled?'The source operation was cancelled.':'The source read could not complete. No partial result was returned.',{...(getSourceFailure(e)?{sourceFailure:getSourceFailure(e)}:{}),...(e instanceof z.ZodError?{reason:responseKind}:{}),cause:e instanceof SourceTimeout||e instanceof SourceCancelled?(getSourceFailure(e)?'source_operation_cancelled':'interruption_unclassified'):e instanceof z.ZodError?'source_response_unusable':sourceFailureCause(e)}));
  }
 }
 estimate(s:Scan,signal:AbortSignal):Promise<Result<number|null>>{
  return this.safe(()=>this.scope.run(key(s),credential(s),async session=>{
   if(s.object.readPlan.rowScope?.predicate){
    const actual=z.array(z.object({name:z.string(),type:z.string()})).parse(await session.query(`SELECT a.attname AS name,t.typname AS type FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped`,[quote(s.object.readPlan.schema)+'.'+quote(s.object.readPlan.object)],'metadata'));
    const allowed:Record<string,string[]>={number:['int2','int4','int8','numeric','money'],text:['text','varchar','bpchar','name','char'],uuid:['uuid'],boolean:['bool'],FLOAT:['float4'],DOUBLE:['float8'],DATE:['date'],TIME:['time'],TIMESTAMP:['timestamp'],TIMESTAMPTZ:['timestamptz']};
    if(s.object.readPlan.rowScope.columns.some(c=>!(allowed[c.type]??allowed[family(c.type)]??[]).includes(actual.find(a=>a.name===c.sourceIdentifier)?.type??'')))return err(new DomainError('validation_failed','A row-scope input no longer has its catalogued source type. Re-introspect and review its row decision.',{cause:'invalid_plan',reason:'row_scope_type'}));
   }
   const known=await session.query('SELECT reltuples::double precision AS rows FROM pg_class WHERE oid=to_regclass($1)',[quote(s.object.readPlan.schema)+'.'+quote(s.object.readPlan.object)],'metadata');
   const metadata=z.array(z.object({rows:z.number()})).parse(known);
   if(!metadata.length||metadata[0]!.rows<0)return ok(null);
   const rows=await session.query('EXPLAIN (FORMAT JSON) '+select(s),undefined,'estimate');
   const explained=z.array(z.object({'QUERY PLAN':z.array(z.object({Plan:z.object({'Plan Rows':z.number().nonnegative()})})).min(1)})).min(1).parse(rows);
   return ok(explained[0]!['QUERY PLAN'][0]!.Plan['Plan Rows']);
  },signal,s.request.requestId),'metadata');
 }
 plain(s:Scan,privileged:EngineSession,table:string,signal:AbortSignal):Promise<Result<void>>{
  if(s.object.readPlan.contributor)return Promise.resolve(err(new DomainError('validation_failed','A contributor proof must use the guarded source reader.',{cause:'invalid_plan',reason:'read_plan'})));
  if(s.object.readPlan.columns.some(c=>c.numericDefault))return Promise.resolve(err(new DomainError('validation_failed','An exact numeric read must use the guarded source reader.',{cause:'invalid_plan',reason:'read_plan'})));
  return this.safe(()=>this.scope.external(key(s),credential(s),async (connection,sourceSignal)=>{
   if(!privileged.staging)throw new Error('Staging unavailable');
   const abort=()=>privileged.interrupt?.();sourceSignal.addEventListener('abort',abort,{once:true});
   try{sourceOperationEvent(s.request.requestId,'scanner','start',1);enginePhase(s.request.requestId,'scan','start');await privileged.staging.materialize(connection,select(s)+` LIMIT ${s.request.settings.maxStagingRows+1}`,table,stagedColumns(s.object.readPlan));enginePhase(s.request.requestId,'scan','end');sourceOperationEvent(s.request.requestId,'scanner','end',1);return ok(undefined);}catch(error){sourceOperationEvent(s.request.requestId,'scanner','failed',1,retainSourceFailure(error,'scanner',1));throw error;}finally{sourceSignal.removeEventListener('abort',abort);}
  },signal));
 }
 treated(s:Scan,consume:(rows:unknown[][])=>Promise<Result<void>>,signal:AbortSignal):Promise<Result<void>>{
  // Private proof labels preserve only equality within this staged relation.
  // Even a withheld/tokenized entity key must never enter either DuckDB session
  // in plaintext. A fresh per-scan key is never sent to the Application.
  const proofKey=s.object.readPlan.contributor?randomBytes(32):undefined;
  const read=async(transforms:((value:unknown)=>Result<unknown>)[]):Promise<Result<void>>=>{enginePhase(s.request.requestId,'scan','start');return this.safe(()=>this.scope.run(key(s),credential(s),async session=>{
   await session.query("SELECT set_config('TimeZone','UTC',true),set_config('DateStyle','ISO, YMD',true),set_config('extra_float_digits','3',true)",undefined,'settings');
        const types = z.array(z.object({ name: z.string(), type: z.string() })).parse(await session.query(`
          WITH RECURSIVE types AS (
            SELECT a.attname AS name, t.oid, t.typname, t.typbasetype
            FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
            WHERE a.attrelid=pg_catalog.to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped
            UNION ALL SELECT types.name,t.oid,t.typname,t.typbasetype
            FROM types JOIN pg_catalog.pg_type t ON t.oid=types.typbasetype
          ) SELECT name,typname AS type FROM types WHERE typbasetype=0`,
          [`${quote(s.object.readPlan.schema)}.${quote(s.object.readPlan.object)}`],'metadata'));
        const entity=s.object.readPlan.contributor;
        if(entity){
         const allowed:Record<string,string[]>={VARCHAR:['text','varchar','bpchar','name','char'],UUID:['uuid'],TINYINT:['int2'],SMALLINT:['int2'],INTEGER:['int4'],BIGINT:['int8'],HUGEINT:['int8'],DATE:['date'],TIMESTAMP:['timestamp'],TIMESTAMPTZ:['timestamptz']};
         if(!allowed[entity.exposedType]?.includes(types.find(t=>t.name===entity.sourceIdentifier)?.type??''))return err(new DomainError('validation_failed','The contributor key no longer has its declared source type. Re-introspect and review its declaration.',{cause:'invalid_plan',reason:'contributor_key_type'}));
        }
        for (const column of s.object.readPlan.columns.filter(c=>c.numericDefault)) {
          const type=types.find(type=>type.name===column.sourceIdentifier)?.type;
          const allowed=column.numericDefault==='array'?['_numeric','_money']:['numeric','money'];
          if(type===undefined||!allowed.includes(type))return err(new DomainError('validation_failed',`Column ${column.exposedName} no longer has its catalogued numeric source type. Re-introspect the source before querying it.`,{cause:'invalid_plan',reason:'read_plan',name:column.exposedName}));
        }
        for (const column of s.object.readPlan.columns.filter(c=>c.treatment==='tokenized')) {
          const type = types.find(type => type.name === column.sourceIdentifier)?.type;
          const expected = column.token!.epochUnit ? 'number' : column.token!.mode;
          if (type === undefined || modes[type] !== expected) return refused();
        }

   let previewOrder=s.preview?.orderBy??[];
   if(s.preview){const primary=z.array(z.object({name:z.string()})).parse(await session.query(`SELECT a.attname AS name FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=ANY(k.conkey) WHERE k.contype='p' AND k.conrelid=to_regclass($1) ORDER BY array_position(k.conkey,a.attnum)`,[quote(s.object.readPlan.schema)+'.'+quote(s.object.readPlan.object)],'metadata'));if(primary.length)previewOrder=primary.map(c=>c.name);}
   await session.query('DECLARE opintel_stage NO SCROLL CURSOR FOR '+select(s,true)+(s.preview?' ORDER BY '+previewOrder.map(quote).join(','):'')+` LIMIT ${s.request.settings.maxStagingRows+1}`,undefined,'declare');
   let scanned=0;let readFailed=false;
   try{for(;;){
    if(signal.aborted)throw new SourceCancelled();
    enginePhase(s.request.requestId,'scan','start');
    const raw=await session.query('FETCH FORWARD 256 FROM opintel_stage',undefined,'fetch');enginePhase(s.request.requestId,'scan','end');
    const rows=z.array(z.record(z.string(),z.unknown())).parse(raw);
    if(!rows.length)break;
    const treated:unknown[][]=[];
    try{
     enginePhase(s.request.requestId,'treat','start');
     for(const row of rows){
      if(++scanned>s.request.settings.maxStagingRows)return err(new DomainError('unsupported_pushdown','The source scan exceeded maxStagingRows before row filtering. Narrow the query or review the setting.',{cause:'scan_observed_large'}));
      s.preview?.scanned();
      const scope=s.object.readPlan.rowScope;
      if(scope&&!scope.pushdown){if(!scope.predicate)continue;const inputs=Object.fromEntries(scope.columns.map(c=>[c.id,row[scopeAlias(s,c.id)]]));const admits=evaluatePredicate(scope.predicate,scope.columns,inputs)===true;for(const k of Object.keys(inputs))inputs[k]=null;if(!admits)continue;}
      const output:unknown[]=[];for(const [i,c] of s.object.readPlan.columns.entries()){
      if(c.numericDefault){const exact=exactDefaultNumeric(row[c.exposedName],c.exposedName,c.numericDefault);if(!exact.ok)return exact;}
      const v=transforms[i]!(row[c.exposedName]);if(!v.ok)return v;if(c.treatment==='tokenized'&&v.value!==null)s.onTokenized?.();output.push(v.value);
     }
     const contributor=s.object.readPlan.contributor;if(contributor){
      // PostgreSQL's typed ::text representation is stable under the UTC/ISO
      // settings above (including integer/UUID normalization and bpchar padding).
      // Do not fold or trim text identities: distinct source entities must remain distinct.
      const value=z.string().nullable().parse(row[contributor.internalName]);
      output.push(value===null?null:createHmac('sha256',proofKey!).update(value,'utf8').digest('hex'));
     }
     treated.push(output);for(const k of Object.keys(row))row[k]=null;}
     enginePhase(s.request.requestId,'treat','end');
     if(signal.aborted)throw new SourceCancelled();const accepted=await consume(treated);if(!accepted.ok)return accepted;
    }finally{for(const row of raw)if(typeof row==='object'&&row!==null)for(const k of Object.keys(row))Reflect.set(row,k,null);for(const row of rows)for(const k of Object.keys(row))row[k]=null;for(const row of treated)row.fill(null);treated.length=0;}
   }return ok(undefined);}catch(error){readFailed=true;throw error;}finally{const closing=session.query('CLOSE opintel_stage',undefined,'close');await (readFailed?closing.catch(()=>{}):closing);}
  },signal,s.request.requestId));};
  const base=s.object.readPlan.columns.map(c=>(value:unknown):Result<unknown>=>c.treatment==='masked'?maskValue(c.mask!.kind,value):ok(value));
  if(!s.object.readPlan.columns.some(c=>c.treatment==='tokenized'))return read(base).finally(()=>proofKey?.fill(0));
  return this.tokenizer.run(ProjectId(s.request.projectId),async run=>{
   for(const [i,c] of s.object.readPlan.columns.entries())if(c.treatment==='tokenized'){
    const config=c.token!,registered=canonicalisers.get(config.canonId);
    if(!registered||registered.mode!==config.mode)return err(new DomainError('validation_failed','The read plan names an unavailable canonicaliser.',{cause:'invalid_token_declaration',reason:'canonicaliser'}));
    const builtin=['stdtext1','stdnum1','stddate1','stdtime1'].includes(config.canonId);
    const transform=run.prepare(config,builtin?undefined:registered);if(!transform.ok)return transform;base[i]=transform.value;
   }
   return read(base);
  },s.request.tokenKeyVersionSelected,s.request.expectedTokenSentinel).finally(()=>proofKey?.fill(0));
 }
}
