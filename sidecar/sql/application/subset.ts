import { z } from 'zod';
import { DomainError, err, ok, type Result } from '../../../src/shared/kernel/index.js';
import * as s from './syntax.js';

export const namespaceSchema = z.strictObject({
 catalog:z.string().min(1),schema:z.string().min(1),
 objects:z.array(z.strictObject({catalog:z.string().min(1),schema:z.string().min(1),name:z.string().min(1)})),
});
export type PoolNamespace = z.infer<typeof namespaceSchema>;
// DuckDB identifier comparison folds ASCII only; Unicode lowercasing would
// conflate distinct objects such as Ä and ä and break namespace containment.
export const foldIdentifier=(value:string)=>value.replace(/[A-Z]/gu,letter=>letter.toLowerCase());
const fold=foldIdentifier;
// Builtin expression functions only. Unknown functions (including extensions,
// dynamic SQL and sequence mutation) fail closed, even if binding would succeed.
const functions=new Set(['sum','avg','min','max','count','count_star','abs','round','ceil','ceiling','floor',
 'lower','upper','length','concat','substring','substr','coalesce','nullif','greatest','least',
 '+','-','*','/','//','%','**','^','~~','!~~','~~*','!~~*']);
// Engine-owned, in-memory metadata and pure series generators. No replacement
// scans, dynamic SQL or external/extension readers are accepted.
const tableFunctions=new Set(['duckdb_tables','duckdb_columns','duckdb_databases','duckdb_views','duckdb_functions','range','generate_series']);

class Inspector {
 failure: DomainError | undefined;
 private visits=0;
 private depth=0;
 constructor(private readonly namespace:PoolNamespace){}
 refuse(construct:string):void {
  this.failure??=new DomainError('sql_not_permitted',`Construct ${construct} is not permitted in this pool.`,{cause:'prohibited_construct',construct,proofCategory:'sql_not_permitted'});
 }
 read<T>(schema:z.ZodType<T>,value:unknown,construct:string):T|undefined {
  const parsed=schema.safeParse(value);
  if(!parsed.success){this.refuse(construct);return;}
  return parsed.data;
 }
 visit(value:unknown,kind:'node'|'table'|'expression'|'modifier',ctes:ReadonlySet<string>):void {
  if(value===null||this.failure)return;
  if(++this.visits>10000||this.depth>=100){this.refuse('query complexity');return;}
  this.depth++;
  try {
   const r=this.read(s.record,value,kind);if(!r)return;
   const tag=String(kind==='expression'?r.class:r.type);
   if(kind==='node')this.node(value,tag,ctes);
   else if(kind==='table')this.table(value,tag,ctes);
   else if(kind==='expression')this.expression(value,tag,ctes);
   else this.modifier(value,tag,ctes);
  }finally{this.depth--;}
 }
 node(value:unknown,tag:string,parent:ReadonlySet<string>):void {
  // Explicit statement-family allowlist, independent of serializer coverage.
  if(tag!=='SELECT_NODE'&&tag!=='SET_OPERATION_NODE'){this.refuse(tag);return;}
  const n=tag==='SELECT_NODE'?this.read(s.select,value,tag):this.read(s.setOperation,value,tag);
  if(!n)return;
  const ctes=new Set(parent);
  // DuckDB resolves CTE scope/order; forward/recursive ambiguity is never
  // permission to access a base object. Every CTE body is inspected as well.
  for(const entry of n.cte_map.map){this.visit(entry.value.query.node,'node',ctes);ctes.add(fold(entry.key));}
  if(n.type==='SELECT_NODE') {
   this.visit(n.from_table,'table',ctes);
   for(const e of [...n.select_list,...n.group_expressions,n.where_clause,n.having])this.visit(e,'expression',ctes);
  }else{this.visit(n.left,'node',ctes);this.visit(n.right,'node',ctes);}
  for(const m of n.modifiers)this.visit(m,'modifier',ctes);
 }
 table(value:unknown,tag:string,ctes:ReadonlySet<string>):void {
  switch(tag){
   case 'EMPTY':this.read(s.emptyTable,value,tag);return;
   case 'BASE_TABLE':{
    const t=this.read(s.baseTable,value,tag);if(!t)return;
    if(!t.catalog_name&&!t.schema_name&&ctes.has(fold(t.table_name)))return;
    const catalog=t.catalog_name||this.namespace.catalog,schema=t.schema_name||this.namespace.schema;
    if(!this.namespace.objects.some(o=>fold(o.catalog)===fold(catalog)&&fold(o.schema)===fold(schema)&&fold(o.name)===fold(t.table_name)))this.refuse(t.table_name);
    return;
   }
   case 'JOIN':{const t=this.read(s.join,value,tag);if(t){this.visit(t.left,'table',ctes);this.visit(t.right,'table',ctes);this.visit(t.condition,'expression',ctes);}return;}
   case 'SUBQUERY':{const t=this.read(s.subqueryTable,value,tag);if(t)this.visit(t.subquery.node,'node',ctes);return;}
   case 'EXPRESSION_LIST':{const t=this.read(s.values,value,tag);if(t)for(const row of t.values)for(const e of row)this.visit(e,'expression',ctes);return;}
   case 'SHOW_REF':{const t=this.read(s.show,value,tag);if(t)this.visit(t.query,'node',ctes);return;}
   case 'TABLE_FUNCTION':{
    const t=this.read(s.tableFunction,value,tag);if(!t)return;
    if(!tableFunctions.has(fold(t.function.function_name))){this.refuse(t.function.function_name);return;}
    for(const child of t.function.children)this.visit(child,'expression',ctes);
    this.visit(t.function.filter,'expression',ctes);this.visit(t.function.order_bys,'modifier',ctes);
    return;
   }
   // Dynamic projection is not admitted. UNPIVOT is serialized as a PIVOT
   // reference by this engine; it receives an explicit tree refusal too.
   case 'PIVOT':this.refuse(tag);return;
   default:this.refuse(tag);
  }
 }
 expression(value:unknown,tag:string,ctes:ReadonlySet<string>):void {
  switch(tag){
   case 'WINDOW':{
    const e=this.read(s.window,value,tag);if(!e)return;
    if(e.schema||e.catalog||!functions.has(fold(e.function_name))){this.refuse(tag);return;}
    for(const child of [...e.children,...e.partitions,...e.orders.map(o=>o.expression),...e.arg_orders.map(o=>o.expression),e.start_expr,e.end_expr,e.offset_expr,e.default_expr,e.filter_expr])this.visit(child,'expression',ctes);return;
   }
   case 'COLUMN_REF':this.read(s.column,value,tag);return;
   case 'CONSTANT':this.read(s.constant,value,tag);return;
   case 'STAR':this.read(s.star,value,tag);return;
   case 'FUNCTION':{
    const e=this.read(s.func,value,tag);if(!e)return;
    if(!functions.has(fold(e.function_name))){this.refuse(e.function_name);return;}
    for(const child of e.children)this.visit(child,'expression',ctes);
    this.visit(e.filter,'expression',ctes);this.visit(e.order_bys,'modifier',ctes);return;
   }
   case 'COMPARISON':{const e=this.read(s.comparison,value,tag);if(e){this.visit(e.left,'expression',ctes);this.visit(e.right,'expression',ctes);}return;}
   case 'OPERATOR':case 'CONJUNCTION':{const e=this.read(s.operator,value,tag);if(e)for(const child of e.children)this.visit(child,'expression',ctes);return;}
   case 'BETWEEN':{const e=this.read(s.between,value,tag);if(e)for(const child of [e.input,e.lower,e.upper])this.visit(child,'expression',ctes);return;}
   case 'SUBQUERY':{const e=this.read(s.subqueryExpression,value,tag);if(e){this.visit(e.subquery.node,'node',ctes);this.visit(e.child,'expression',ctes);}return;}
   case 'CASE':{const e=this.read(s.caseExpression,value,tag);if(e){for(const arm of e.case_checks){this.visit(arm.when_expr,'expression',ctes);this.visit(arm.then_expr,'expression',ctes);}this.visit(e.else_expr,'expression',ctes);}return;}
   default:this.refuse(tag);
  }
 }
 modifier(value:unknown,tag:string,ctes:ReadonlySet<string>):void {
  if(tag==='ORDER_MODIFIER'){const m=this.read(s.orders,value,tag);if(m)for(const o of m.orders)this.visit(o.expression,'expression',ctes);}
  else if(tag==='LIMIT_MODIFIER'){const m=this.read(s.limit,value,tag);if(m){this.visit(m.limit,'expression',ctes);this.visit(m.offset,'expression',ctes);}}
  else if(tag==='DISTINCT_MODIFIER')this.read(s.distinct,value,tag);
  else this.refuse(tag);
 }
}

export function inspectSubset(tree:unknown,namespace:PoolNamespace):Result<void>{
 const inspector=new Inspector(namespace);
 const doc=inspector.read(s.document,tree,'statements');
 if(doc)inspector.visit(doc.statements[0]!.node,'node',new Set());
 return inspector.failure?err(inspector.failure):ok(undefined);
}
