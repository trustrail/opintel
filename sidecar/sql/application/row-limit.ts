import * as syntax from './syntax.js';
const constant=(value:number)=>({class:'CONSTANT',type:'VALUE_CONSTANT',alias:'',query_location:0,value:{type:{id:'BIGINT',type_info:null},is_null:false,value}});
export function withRowLimit(tree:unknown,limit:number):unknown{
 const doc=syntax.document.parse(structuredClone(tree));
 const node=doc.statements[0]!.node;
 const q=syntax.select.safeParse(node),set=syntax.setOperation.safeParse(node);
 if(!q.success&&!set.success)throw new Error('Unsupported row-limit node.');
 const root=q.success?q.data:set.data!;
 const old=root.modifiers.find(m=>syntax.limit.safeParse(m).success);
 if(old){const m=syntax.limit.parse(old),bounded=m.limit===null?constant(limit):{class:'FUNCTION',type:'FUNCTION',alias:'',query_location:0,function_name:'least',schema:'',catalog:'',children:[m.limit,constant(limit)],filter:null,order_bys:{type:'ORDER_MODIFIER',orders:[]},distinct:false,is_operator:false,export_state:false};root.modifiers=root.modifiers.map(v=>v===old?{...m,limit:bounded}:v);}
 else root.modifiers.push({type:'LIMIT_MODIFIER',limit:constant(limit),offset:null});
 doc.statements[0]!.node=root;return doc;
}
