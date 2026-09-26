import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CatalogElement } from '../src/modules/catalog/index.js';
import { compileViews, type CompileInput, type CompileResult } from '../src/modules/entitlements/index.js';
import { fixture, generated, unwrap, type ColumnSpec } from './fixtures/view-compiler/input.js';
import { identifierKey, parseProjection } from './fixtures/view-compiler/ddl-oracle.js';

function inspect(input:CompileInput,result:CompileResult):void {
 const allDDL=result.views.map(view=>view.ddl).join('\n');
 for(const element of input.elements){
  const treatment=input.entitlements.get(element.state.id)?.state.treatment;
  if(treatment===undefined||treatment==='withheld'){
   const name=element.state.exposedName;
   if(name!==null){
    // Full-output search, including target/FROM addresses and any trailing SQL.
    // Generated denial markers do not overlap legal structural/readable names.
    expect(allDDL,`Denied raw identifier ${name}`).not.toContain(name);
    expect(allDDL,`Denied SQL-escaped identifier ${name}`).not.toContain(name.split('"').join('""'));
   }
  }
 }
 const emittedObjects=new Set<string>();
 for(const view of result.views){
  const sql=parseProjection(view.ddl);
  expect(sql.view).toEqual([view.catalog,view.schema,view.name]);
  const matching=input.objects.filter(object=>{
   const source=input.boundSources.find(s=>s.id===object.state.sourceId);
   return source && [source.alias,object.state.exposedSchema,object.state.exposedName].map(identifierKey).join('\0')===sql.view.map(identifierKey).join('\0');
  });
  expect(matching,'Every view namespace must resolve unambiguously').toHaveLength(1);
  const object=matching[0]!;emittedObjects.add(object.state.id);
  // Catalog/schema/object/staging identifiers are structural, not columns:
  // validate them against the input address, never against compiler metadata.
  expect(sql.from).toEqual(['__staging',sql.view.join('__')]);
  const inObject=input.elements.filter(e=>e.state.objectId===object.state.id&&e.state.status==='active');
  for(const name of sql.columns){
   const matches=inObject.filter(e=>e.state.exposedName!==null&&identifierKey(e.state.exposedName)===identifierKey(name));
   expect(matches,`Identifier ${name} must resolve to exactly one catalogue element`).toHaveLength(1);
   const entitlement=input.entitlements.get(matches[0]!.state.id);
   expect(entitlement,`Identifier ${name} needs an entitlement`).toBeDefined();
   expect(entitlement!.state.poolId).toBe(input.poolId);
   expect(entitlement!.state.treatment).not.toBe('withheld');
  }
  const readable=inObject.filter(e=>{const t=input.entitlements.get(e.state.id)?.state.treatment;return t!==undefined&&t!=='withheld';}).sort((a,b)=>a.state.ordinal!-b.state.ordinal!);
  expect(sql.columns).toEqual(readable.map(e=>e.state.exposedName));
  expect(new Set(sql.columns.map(identifierKey)).size).toBe(sql.columns.length);
  expect(view.readPlan.columns.map(c=>c.exposedName)).toEqual(sql.columns);
  expect(view.readPlan.columns.map(c=>c.sourceIdentifier)).toEqual(readable.map(e=>e.state.sourceIdentifier));
 }
 // Prevent a compiler from satisfying nondisclosure by omitting readable objects.
 for(const object of input.objects){
  if(input.elements.some(e=>e.state.objectId===object.state.id&&input.entitlements.has(e.state.id)&&input.entitlements.get(e.state.id)!.state.treatment!=='withheld'))expect(emittedObjects.has(object.state.id)).toBe(true);
 }
}

describe('view compiler invariants derived from B.1–B.4a',()=>{
 it.each(Array.from({length:64},(_,i)=>i+1))('VC-01/02/05/06/07/31: full DDL, resolution and read-plan equality, seed %i',seed=>{
  const input=generated(seed);inspect(input,unwrap(compileViews(input)));
 });
 it('the independent SQL oracle rejects expressions, comments, wildcards and trailing SQL',()=>{
  for(const sql of [
   'CREATE VIEW "c"."s"."v" AS SELECT * FROM "__staging"."x";',
   'CREATE VIEW "c"."s"."v" AS SELECT token("x") FROM "__staging"."x";',
   'CREATE VIEW "c"."s"."v" AS SELECT "x" AS "y" FROM "__staging"."x";',
   'CREATE VIEW "c"."s"."v" AS SELECT "x" FROM "__staging"."x"; -- "hidden"',
   'CREATE VIEW "c"."s"."v" AS SELECT "x" FROM "__staging"."x" WHERE "hidden";',
  ])expect(()=>parseProjection(sql)).toThrow();
  expect(parseProjection('CREATE VIEW "c"."s"."v" AS SELECT "a""b", "FROM" FROM "__staging"."x";').columns).toEqual(['a"b','FROM']);
 });
 it('the nondisclosure oracle scans outside SELECT and ignores a misleading metadata list',()=>{
  const input=fixture([{name:'oracle_probe',columns:[{name:'visible_column',treatment:'clear'},{name:'denied_unique_marker',treatment:null}]}]);
  const result=unwrap(compileViews(input)),view=result.views[0]!;
  for(const ddl of [view.ddl+' -- denied_unique_marker',view.ddl.replace('FROM ', 'FROM "denied_unique_marker".')]){
   expect(()=>inspect(input,{...result,views:[{...view,ddl,columns:[]}]})).toThrow('Denied');
  }
 });
 it.each(['all_withheld','all_undecided','mixed_withheld_undecided'] as const)('VC-04: %s emits no view and reports the exact reason',reason=>{
  const columns:ColumnSpec[]=[{name:'blocked_a',treatment:reason==='all_undecided'?null:'withheld'},
   {name:'blocked_b',treatment:reason==='all_withheld'?'withheld':null}];
  const result=unwrap(compileViews(fixture([{name:'unavailable_object',columns}])));
  expect(result.views).toEqual([]);
  expect(result.omitted).toEqual([{catalog:'fixture_catalog',schema:'fixture_schema',name:'unavailable_object',reason}]);
 });
 it('VC-03: withheld and undecided produce identical DDL, but distinct metadata',()=>{
  const compile=(treatment:'withheld'|null)=>unwrap(compileViews(fixture([{name:'mixed',columns:[{name:'readable',treatment:'clear'},{name:'blocked',treatment}]}])));
  const denied=compile('withheld'),undecided=compile(null);
  expect(denied.views.map(v=>v.ddl)).toEqual(undecided.views.map(v=>v.ddl));
  expect(denied.views[0]!.columns.find(c=>c.exposedName==='blocked')?.state).toBe('withheld');
  expect(undecided.views[0]!.columns.find(c=>c.exposedName==='blocked')?.state).toBe('undecided');
 });
 it.each(['select','FROM','order','group','a"b','"; DROP VIEW x; --','東京','Größe','é','e\u0301','🚀','a.b','line\nbreak',' spaced name '])('VC-06/07: hostile stored identifier %j round-trips without becoming syntax',name=>{
  const input=fixture([{alias:'catalog"quote',schema:'schema.東京',name:'object"; --',columns:[{name,treatment:'clear'}]}]);
  const result=unwrap(compileViews(input));inspect(input,result);
  expect(parseProjection(result.views[0]!.ddl).columns).toEqual([name]);
 });
 it.each(['catalog','schema','object'] as const)('case-only %s addresses cannot alias separate objects',level=>{
  const address=(upper:boolean)=>({alias:level==='catalog'?(upper?'Warehouse':'warehouse'):'fixture_catalog',
   schema:level==='schema'?(upper?'Public':'public'):'fixture_schema',name:level==='object'?(upper?'Orders':'orders'):'records',
   columns:[{name:upper?'left_value':'right_value',treatment:'clear' as const}]});
  const input=fixture([address(true),address(false)]),result=compileViews(input);
  if(result.ok)inspect(input,result.value);
 });
 it('stored suffixes survive source names that differ by case or normalise to one name',()=>{
  const columns:ColumnSpec[]=[
   {source:'Customer ID',name:'customer_id',treatment:'clear'},
   {source:'customer-id',name:'customer_id_2',treatment:'tokenized'},
   {source:'CUSTOMER_ID',name:'customer_id_3',treatment:'masked'},
   {source:'Customer_Id',name:'customer_id_4',treatment:'aggregate_only'},
   {source:'customer id',name:'customer_id_5',treatment:null},
  ];
  const input=fixture([{name:'assigned_names',columns}]);inspect(input,unwrap(compileViews(input)));
 });
 it.each(['withheld',null] as const)('case-only exposed names cannot alias a %s element',treatment=>{
  const input=fixture([{name:'case_collision',columns:[{name:'AccountRef',treatment:'clear'},{name:'accountref',treatment}]}]);
  const result=compileViews(input);
  // A refusal is safe; successful compilation must satisfy name resolution.
  // No demand for the compiler to repair or rename already assigned names.
  if(result.ok)inspect(input,result.value);
 });
 it('case-only readable exposed names cannot create an ambiguous projection',()=>{
  const input=fixture([{name:'case_collision',columns:[{name:'Amount',treatment:'clear'},{name:'amount',treatment:'clear'}]}]);
  const result=compileViews(input);if(result.ok)inspect(input,result.value);
 });
 it('duplicate assigned exposed names are refused rather than silently merged',()=>{
  // Build independently valid aggregates, then combine the public element snapshot:
  // testing the compiler boundary must not be pre-empted by aggregate validation.
  const input=fixture([{name:'duplicate_snapshot',columns:[{name:'one',treatment:'clear'},{name:'two',treatment:'clear'}]}]);
  const left=input.elements[0]!,right=input.elements[1]!;
  const elements=[left,new CatalogElement({...right.state,exposedName:left.state.exposedName})];
  expect(compileViews({...input,elements}).ok).toBe(false);
 });
 it.each([
  {type:'VARCHAR',declarations:{tokenDomain:'person2',canonId:'stdtext1',caseInsensitive:true},token:{domain:'person2',canonId:'stdtext1',mode:'text',caseInsensitive:true}},
  {type:'BIGINT',declarations:{tokenDomain:'amount2',canonId:'stdnum1'},token:{domain:'amount2',canonId:'stdnum1',mode:'number',caseInsensitive:false}},
  {type:'TIMESTAMP',declarations:{tokenDomain:'instant2',canonId:'stdtime1',sourceTimezone:'Europe/Paris'},token:{domain:'instant2',canonId:'stdtime1',mode:'timestamp',caseInsensitive:false,sourceTimezone:'Europe/Paris'}},
  {type:'BIGINT',declarations:{tokenDomain:'epoch2',canonId:'stdtime1',epochUnit:'milliseconds',sourceTimezone:'UTC'},token:{domain:'epoch2',canonId:'stdtime1',mode:'timestamp',caseInsensitive:false,epochUnit:'milliseconds',sourceTimezone:'UTC'}},
 ] as const)('VC-09/31/32: $type token declarations accompany text reads and plain identifiers',({type,declarations,token})=>{
  const input=fixture([{name:'token_object',columns:[{name:'treated"column',type,declarations,treatment:'tokenized'}]}]);
  const result=unwrap(compileViews(input));inspect(input,result);
  expect(result.views[0]!.readPlan.columns).toEqual([{sourceIdentifier:'native_0',exposedName:'treated"column',exposedType:'VARCHAR',treatment:'tokenized',readAs:'text',token}]);
  expect(parseProjection(result.views[0]!.ddl).columns).toEqual(['treated"column']);
 });
 it('VC-16: repeated runs and fresh processes produce byte-identical complete output',async()=>{
  const run=promisify(execFile);
  for(const seed of [1,19,64]){
   const input=generated(seed),before=JSON.stringify({...input,entitlements:[...input.entitlements]}),bytes=JSON.stringify(compileViews(input));
   for(let i=0;i<10;i++)expect(JSON.stringify(compileViews(input))).toBe(bytes);
   expect(JSON.stringify({...input,entitlements:[...input.entitlements]})).toBe(before);
   const child=await run(process.execPath,['--import','tsx',fileURLToPath(new URL('./fixtures/view-compiler/fresh-process.ts',import.meta.url)),String(seed)],
    {cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,TZ:'Pacific/Auckland',LANG:'tr_TR.UTF-8'},timeout:20000,maxBuffer:2*1024*1024});
   expect(child.stderr).toBe('');expect(child.stdout).toBe(bytes);
  }
 },30000);
});
