import { stagingType } from '../../../src/shared/staging-types.js';
import type { ExecutionRequest,StagingObject } from '../../../src/shared/execution-contract.js';
import { z } from 'zod';
const record=z.record(z.string(),z.unknown());
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const literal=(s:string)=>"E'"+s.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
export function nativeExpression(column:StagingObject['readPlan']['columns'][number]):string{const type=stagingType(column.exposedType)!;return type.postgres?`CAST(${quote(column.sourceIdentifier)} AS ${type.postgres})`:quote(column.sourceIdentifier);}
/** Only a single base object's simple clear predicates are translated. All
 * other shapes keep the full input estimate and the maxStagingRows guard. */
export function pushdown(tree:unknown,object:StagingObject,request:ExecutionRequest):string|null{
 const doc=z.object({statements:z.array(z.object({node:record}))}).parse(tree),q=doc.statements[0]?.node;
 if(!q||q.type!=='SELECT_NODE')return null;
 let selects=0;const count=(v:unknown):void=>{if(Array.isArray(v))v.forEach(count);else if(v&&typeof v==='object'){const r=v as Record<string,unknown>;if(r.type==='SELECT_NODE')selects++;Object.values(r).forEach(count);}};count(tree);if(selects!==1)return null;
 const from=record.safeParse(q.from_table);if(!from.success||from.data.type!=='BASE_TABLE')return null;
 const t=from.data;
 if(t.table_name!==object.name||(t.catalog_name||request.namespace.catalog)!==object.catalog||(t.schema_name||request.namespace.schema)!==object.schema)return null;
 const expression=(value:unknown):string|null=>{
  const r=record.safeParse(value);if(!r.success)return null;const e=r.data;
  if(e.class==='COLUMN_REF'){
   const names=z.array(z.string()).safeParse(e.column_names);if(!names.success)return null;
   const col=object.readPlan.columns.find(c=>c.exposedName===names.data.at(-1));
   if(!col||col.treatment!=='clear'||stagingType(col.exposedType)!.complex)return null;
   return nativeExpression(col)+(col.exposedType==='VARCHAR'?' COLLATE "C"':'');
  }
  if(e.class==='CONSTANT'){
   const v=z.object({is_null:z.boolean(),value:z.union([z.string(),z.number(),z.boolean()]).optional()}).safeParse(e.value);
   if(!v.success)return null;if(v.data.is_null)return 'NULL';
   if(typeof v.data.value==='boolean')return v.data.value?'TRUE':'FALSE';
   if(typeof v.data.value==='number')return Number.isFinite(v.data.value)?String(v.data.value):null;
   return typeof v.data.value==='string'?literal(v.data.value):null;
  }
  if(e.class==='COMPARISON'){
   const op=({COMPARE_EQUAL:'=',COMPARE_NOTEQUAL:'<>',COMPARE_LESSTHAN:'<',COMPARE_LESSTHANOREQUALTO:'<=',COMPARE_GREATERTHAN:'>',COMPARE_GREATERTHANOREQUALTO:'>='} as Record<string,string>)[String(e.type)];
   const left=expression(e.left),right=expression(e.right);return op&&left!==null&&right!==null?`(${left} ${op} ${right})`:null;
  }
  if(e.class==='CONJUNCTION'&&Array.isArray(e.children)){
   const parts=e.children.map(expression);
   if(e.type==='CONJUNCTION_AND'){const usable=parts.filter((v):v is string=>v!==null);return usable.length?'('+usable.join(' AND ')+')':null;}
   if(e.type==='CONJUNCTION_OR'&&parts.every(v=>v!==null))return '('+parts.join(' OR ')+')';
  }
  return null;
 };
 return expression(q.where_clause);
}
export function referencedObjects(tree:unknown,objects:StagingObject[],request:ExecutionRequest):StagingObject[]{
 const found=new Set<StagingObject>();
 const visit=(v:unknown)=>{
  if(Array.isArray(v)){v.forEach(visit);return;}if(!v||typeof v!=='object')return;
  const r=v as Record<string,unknown>;
  if(r.type==='BASE_TABLE')for(const o of objects)if(String(r.table_name).replace(/[A-Z]/gu,c=>c.toLowerCase())===o.name.replace(/[A-Z]/gu,c=>c.toLowerCase())&&String(r.catalog_name||request.namespace.catalog).replace(/[A-Z]/gu,c=>c.toLowerCase())===o.catalog.replace(/[A-Z]/gu,c=>c.toLowerCase())&&String(r.schema_name||request.namespace.schema).replace(/[A-Z]/gu,c=>c.toLowerCase())===o.schema.replace(/[A-Z]/gu,c=>c.toLowerCase()))found.add(o);
  Object.values(r).forEach(visit);
 };visit(tree);return [...found];
}
