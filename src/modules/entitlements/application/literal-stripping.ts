import {z} from 'zod';
import * as syntax from './query-syntax.js';
/** Reuses C.3's strict structural schemas. Unknown constructs are hidden, never
 * partially inspected. Constants are replaced in the tree, not in SQL text. */
export function literalStrippedTree(input:unknown):unknown|null {
 let visits=0;
 const ctes=new Set<string>();
 const constant=syntax.constant.extend({value:syntax.constant.shape.value.extend({type:z.object({id:z.string(),type_info:z.unknown()}).strict()})});
 const cast=z.object({class:z.literal('CAST'),type:z.literal('OPERATOR_CAST'),alias:z.string(),query_location:z.number(),child:z.unknown(),cast_type:z.object({id:z.enum(['BOOLEAN','DATE','TIMESTAMP','TIMESTAMP_TZ','VARCHAR','INTEGER','BIGINT','DOUBLE']),type_info:z.null()}).strict(),try_cast:z.boolean()}).strict();
 const expression:Record<string,z.ZodType>={COLUMN_REF:syntax.column,CONSTANT:constant,CAST:cast,STAR:syntax.star,FUNCTION:syntax.func,COMPARISON:syntax.comparison,OPERATOR:syntax.operator,CONJUNCTION:syntax.operator,BETWEEN:syntax.between,WINDOW:syntax.window};
 const structural:Record<string,z.ZodType>={SELECT_NODE:syntax.select,BASE_TABLE:syntax.baseTable,EMPTY:syntax.emptyTable,JOIN:syntax.join,SUBQUERY:syntax.subqueryTable,EXPRESSION_LIST:syntax.values,SHOW_REF:syntax.show,ORDER_MODIFIER:syntax.orders,LIMIT_MODIFIER:syntax.limit,DISTINCT_MODIFIER:syntax.distinct};
 function visit(value:unknown,depth:number):unknown {
  if(++visits>10000||depth>100)throw new Error('Complex tree');
  if(Array.isArray(value))return value.map(child=>visit(child,depth+1));
  if(value===null||typeof value!=='object')return value;
  const node=syntax.record.parse(value);
  if(typeof node.class==='string'){
   const shape=expression[node.class];if(!shape)throw new Error('Unsupported expression');shape.parse(node);
   if(node.class==='CONSTANT')return {...node,query_location:0,value:{type:{id:'VARCHAR',type_info:null},is_null:false,value:'[redacted]'}};
  }else if(typeof node.type==='string'){
   const shape=structural[node.type];if(!shape)throw new Error('Unsupported structure');shape.parse(node);
   if(node.type==='SELECT_NODE')for(const entry of syntax.select.parse(node).cte_map.map)ctes.add(entry.key);
   // DuckDB normalizes a quoted file path in FROM into BASE_TABLE. C.3
   // accepts qualified catalogue references or CTEs only; never expose that
   // normalized path as though it had been an identifier in a valid query.
   if(node.type==='BASE_TABLE'){
    const table=syntax.baseTable.parse(node);
    if(!(table.catalog_name&&table.schema_name)&&!(table.catalog_name===''&&table.schema_name===''&&ctes.has(table.table_name)))throw new Error('Unqualified source');
   }
  }
  return Object.fromEntries(Object.entries(node).map(([key,child])=>[key,key==='query_location'?0:visit(child,depth+1)]));
 }
 try{return visit(syntax.document.parse(input),0);}catch{return null;}
}
