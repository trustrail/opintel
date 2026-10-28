import {z} from 'zod';
import type {Specification,Scenario,ObjectExpectation} from './specification.js';
import type {DescribeOutput} from '../../src/shared/api/mcp.js';
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
 const canonical=(rows:unknown[][])=>JSON.stringify(rows.map(r=>JSON.stringify(r)).sort());
 if(s.expected.resultRows){
  if(JSON.stringify(columns.map(c=>c.name))!==JSON.stringify(s.expected.resultColumns))return false;
  return canonical(rows.map(r=>r.map((v,i)=>s.expected.resultColumns?.[i]==='n'?Number(v):v)))===canonical(s.expected.resultRows);
 }
 for(const relation of s.expected.tokenRelations??[]){
  const a=columns.findIndex(c=>c.name===relation.left),b=columns.findIndex(c=>c.name===relation.right);
  if(a<0||b<0||rows.some(r=>r[a]!==null&&r[b]!==null&&((r[a]===r[b])!==relation.equal)))return false;
 }
 if(!s.expected.rows)return true;
 if(s.kind==='declared aggregate')return canonical(rows.map(r=>r.map(v=>v===null?null:Number(v))))===canonical(s.expected.rows.map(r=>[r.n,r.total]));
 if(columns.length!==s.columns.length||columns.some((c,i)=>c.name!==s.columns[i]?.alias))return false;
 const expected=s.expected.rows.map(r=>s.columns.map(c=>{const value=s.objects.length>1?r[c.alias]:r[c.name];const t=spec.objects.find(o=>o.name===c.object&&o.poolIndex===s.poolIndex)!.columns.find(v=>v.name===c.name)!.treatment;return value===null?null:t==='masked'?declaredMask(value):t==='tokenized'?{kind:'token'}:t==='custody'?{kind:'sealed'}:value;}));
 const actual=rows.map(r=>r.map((value,i)=>{const c=s.columns[i]!;const t=spec.objects.find(o=>o.name===c.object&&o.poolIndex===s.poolIndex)!.columns.find(v=>v.name===c.name)!.treatment;return t==='tokenized'&&typeof value==='string'&&/^v1_[^_]+_[0-9A-HJKMNP-TV-Z]{26}$/u.test(value)?{kind:'token'}:t==='custody'&&typeof value==='string'&&value.startsWith('opintelsealed:v1:')?{kind:'sealed'}:value;}));
 return canonical(actual)===canonical(expected);
}

/** Independent fixture oracle for each governed scan, never learned from receipts.
 * Single-object declared queries supply their own expected result count. Joins
 * and aggregates retain per-input scan counts, not their final answer count.
 */
export function expectedReturnedRows(object:ObjectExpectation,declared?:Scenario):number {
 if(declared&&declared.objects.length===1&&declared.kind!=='declared aggregate'&&declared.kind!=='treatment semantics'&&declared.expected.rowCount!==undefined)return declared.expected.rowCount;
 // Composed IS NOT NULL is evaluated outside staging, not pushed into scans.
 // Its final-answer count is checked separately by the query-result oracle.
 return object.rows.length;
}

/** Receipt candidate is read from token_join_candidate for this query run. */
export function refusalEvidenceMatches(s:Scenario,id:string,detail:unknown){
 const parsed=refusalEvidence.safeParse(detail);
 if(!parsed.success||parsed.data.refusalCode!==s.expected.outcome||!parsed.data.stages.some(v=>v.result==='refuse'&&v.code===s.expected.outcome))return false;
 if(!s.expected.suggestionCandidate)return true;
 const candidate=parsed.data.metadata?.refusal?.candidate;
 return candidate?.id===id&&JSON.stringify(candidate.columns.map(c=>c.name).sort())===JSON.stringify(s.objects.map(name=>name+'.isolated_key').sort());
}
const refusalEvidence=z.object({refusalCode:z.string().nullable(),stages:z.array(z.object({result:z.string(),code:z.string().nullable()})),metadata:z.object({refusal:z.object({candidate:z.object({id:z.uuid(),columns:z.tuple([z.object({elementId:z.uuid(),name:z.string()}),z.object({elementId:z.uuid(),name:z.string()})])}).nullable()}).nullable()}).optional()});
