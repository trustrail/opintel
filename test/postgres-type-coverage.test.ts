import {it,expect} from 'vitest';
import {withPlatform} from '../src/platform/db/scope.js';
import {classifySourceType,mapSourceType} from '../src/modules/catalog/index.js';
// Independent inventory: adding a PostgreSQL built-in requires a reviewed
// mapping or an explicit addition to this unmapped list, never a catch-all pass.
const unmapped=new Set(`aclitem bit bit varying cid cidr datemultirange daterange gtsvector inet int4multirange int4range int8multirange int8range interval jsonpath macaddr macaddr8 nummultirange numrange oid pg_brin_bloom_summary pg_brin_minmax_multi_summary pg_dependencies pg_lsn pg_mcv_list pg_ndistinct pg_node_tree pg_snapshot refcursor regclass regcollation regconfig regdictionary regnamespace regoper regoperator regproc regprocedure regrole regtype tid timetz tsmultirange tsquery tsrange tstzmultirange tstzrange tsvector txid_snapshot varbit xid xid8 xml`.split(' '));
const excluded=new Set(['bytea','point','line','lseg','box','path','polygon','circle']);
it('every PostgreSQL built-in that format_type can report has an explicit disposition',async()=>{
 const rows=await withPlatform(tx=>tx.query<{typname:string;typtype:string;reported:string}>(`SELECT t.typname,t.typtype,format_type(t.oid,NULL) AS reported
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname='pg_catalog' AND t.typtype<>'p' AND t.typcategory<>'A'`));
 expect(rows.length).toBeGreaterThan(50);
 for(const row of rows){
  const result=classifySourceType(row.reported);
  if(result.exposedType!==null)expect(result.unsupportedReason).toBeNull();
  else if(excluded.has(row.typname))expect(result.unsupportedReason).toBe('explicitly_excluded');
  else {expect(row.typtype==='c'||unmapped.has(row.typname),row.reported+' needs a mapping decision').toBe(true);expect(result.unsupportedReason).toBe('unmapped');}
  expect(classifySourceType(row.reported+'[]').unsupportedReason).toBe(result.unsupportedReason);
 }
});
it('covers every temporal precision PostgreSQL permits, using its actual format_type output',async()=>{
 for(const precision of [0,1,2,3,4,5,6]){
  const rows=await withPlatform(tx=>tx.query<{typname:string;reported:string}>(`SELECT typname,format_type(oid,$1) AS reported FROM pg_type WHERE typname IN ('timestamp','timestamptz','time','timetz')`,[precision]));
  for(const row of rows)expect(mapSourceType(row.reported)).toBe(({timestamp:'TIMESTAMP',timestamptz:'TIMESTAMPTZ',time:'TIME',timetz:null} as Record<string,string|null>)[row.typname]);
 }
});
it('distinguishes deliberate exclusions, unknown types and exact numeric defaults',()=>{
 expect(classifySourceType('bytea')).toEqual({exposedType:null,unsupportedReason:'explicitly_excluded'});
 expect(classifySourceType('customer_domain')).toEqual({exposedType:null,unsupportedReason:'unmapped'});
 for(const type of ['numeric','money'])expect(mapSourceType(type)).toBe('DECIMAL(38,9)');
 for(const type of ['name','"char"'])expect(mapSourceType(type)).toBe('VARCHAR');
});
