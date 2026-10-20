import type {Specification,Scenario,ObjectExpectation} from './specification.js';
import type {DescribeOutput} from '../../src/shared/api/mcp.js';
import type {z} from 'zod';
type ObjectInfo=z.infer<typeof DescribeOutput>['objects'][number];
export function scenarioPlan(s:Scenario,spec:Specification){
 const objects:ObjectInfo[]=s.objects.map(name=>{const o=spec.objects.find(o=>o.name===name&&o.poolIndex===s.poolIndex)!;return {name,columns:o.columns.filter(c=>c.treatment!=='undecided'&&c.treatment!=='withheld').map(c=>({name:c.name,type:c.type,treatment:c.treatment as ObjectInfo['columns'][number]['treatment']})),withheld:o.columns.filter(c=>c.treatment==='withheld').map(c=>c.name)};});
 const selected=s.columns.flatMap(c=>{const object=objects.find(o=>o.name===c.object)!;const column=object.columns.find(v=>v.name===c.name);return column?[{object,column,alias:c.alias,side:c.side}]:[];});
 const aggregate=s.kind==='declared aggregate'?objects[0]!.columns.find(c=>c.treatment==='aggregate_only'):undefined;
 return {sql:s.sql,kind:s.kind,objects,selected,...aggregate?{aggregate}:{},...s.kind==='declared join'?{join:'policy_id'}:{}};
}
export function discoveryMismatches(spec:Specification,pool:number,objects:ObjectInfo[]){
 const errors=[];
 for(const expected of spec.objects.filter(o=>o.poolIndex===pool))for(const c of expected.columns){const o=objects.find(o=>o.name===expected.name);const actual=o?.columns.find(v=>v.name===c.name)?.treatment??(o?.withheld.includes(c.name)?'withheld':'undecided');if(actual!==c.treatment)errors.push({object:expected.name,column:c.name,expected:c.treatment,actual});}
 return errors;
}
export function declaredMask(value:unknown){if(value===null)return null;const chars=Array.from(String(value));return chars.length<=4?'****':'••••'+chars.slice(-4).join('');}
/** Compare unordered bags, preserving duplicates, nulls and Unicode code points. */
export function scenarioValuesMatch(s:Scenario,spec:Specification,columns:Array<{name:string}>,rows:unknown[][]){
 if(!s.expected.rows)return true;
 const canonical=(rows:unknown[][])=>JSON.stringify(rows.map(r=>JSON.stringify(r)).sort());
 if(s.kind==='declared aggregate')return canonical(rows.map(r=>r.map(v=>v===null?null:Number(v))))===canonical(s.expected.rows.map(r=>[r.n,r.total]));
 if(columns.length!==s.columns.length||columns.some((c,i)=>c.name!==s.columns[i]?.alias))return false;
 const expected=s.expected.rows.map(r=>s.columns.map(c=>{const value=s.kind==='declared join'?r[c.alias]:r[c.name];const t=spec.objects.find(o=>o.name===c.object&&o.poolIndex===s.poolIndex)!.columns.find(v=>v.name===c.name)!.treatment;return value===null?null:t==='masked'?declaredMask(value):t==='tokenized'?{kind:'token'}:t==='custody'?{kind:'sealed'}:value;}));
 const actual=rows.map(r=>r.map((value,i)=>{const c=s.columns[i]!;const t=spec.objects.find(o=>o.name===c.object&&o.poolIndex===s.poolIndex)!.columns.find(v=>v.name===c.name)!.treatment;return t==='tokenized'&&typeof value==='string'&&/^v1_[^_]+_[0-9A-HJKMNP-TV-Z]{26}$/u.test(value)?{kind:'token'}:t==='custody'&&typeof value==='string'&&value.startsWith('opintelsealed:v1:')?{kind:'sealed'}:value;}));
 return canonical(actual)===canonical(expected);
}

/** Independent fixture oracle for each governed scan, never learned from receipts.
 * Single-object declared queries supply their own expected result count. Joins
 * and aggregates retain per-input scan counts, not their final answer count.
 */
export function expectedReturnedRows(object:ObjectExpectation,declared?:Scenario):number {
 if(declared&&declared.objects.length===1&&declared.kind!=='declared aggregate'&&declared.expected.rowCount!==undefined)return declared.expected.rowCount;
 // Composed IS NOT NULL is evaluated outside staging, not pushed into scans.
 // Its final-answer count is checked separately by the query-result oracle.
 return object.rows.length;
}
