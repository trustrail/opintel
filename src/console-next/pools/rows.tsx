import {Select} from '../components/select.js';
import type {CatalogNode} from '../../shared/api/catalog.js';
import {family,parsePredicate} from '../../shared/row-predicate-syntax.js';
import {PoolRowRule} from '../../shared/api/pool-tables.js';
import {KindIcon,TableIcon,Glyph} from '../components/kind.js';
import {Checkbox} from '../components/primitives.js';
export type ConditionDraft={column:string;operator:'='|'<>'|'<'|'<='|'>'|'>=';value:string;type:'text'|'number'|'boolean'|'null'};
export type RuleDraft=ConditionDraft&{all:boolean;combine?:'and'|'or';extra?:ConditionDraft[]};
export const newRule=():RuleDraft=>({all:false,column:'',operator:'=',value:'',type:'text'});
const conditionValue=(d:ConditionDraft)=>({column:d.column,operator:d.operator,value:d.type==='null'?null:d.type==='number'?Number(d.value):d.type==='boolean'?d.value==='true':d.value});
export function ruleValue(d:RuleDraft):PoolRowRule{if(d.all)return {allRows:true};return d.extra?.length?{combine:d.combine??'and',conditions:[d,...d.extra].map(conditionValue)}:conditionValue(d);}
export type TableColumns={tableId:string;columns:CatalogNode[];name?:string};
export type ColumnChoice={name:string;type:string;tables:number;tableNames?:string[];totalTables?:number};
export function columnChoices(tables:TableColumns[]):ColumnChoice[]{
 const names=new Map<string,Map<string,number>>();
 for(const table of tables){for(const column of table.columns){if(column.kind!=='element'||!column.label||!column.exposedType||family(column.exposedType)==='unsupported')continue;const types=names.get(column.label)??new Map<string,number>();types.set(column.exposedType,(types.get(column.exposedType)??0)+1);names.set(column.label,types);}}
 return [...names].map(([name,types])=>{const present=tables.filter(t=>t.columns.some(c=>c.label===name));return {name,type:[...types].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]![0],tables:present.length,totalTables:tables.length,tableNames:present.flatMap(t=>t.name?[t.name]:[])};}).sort((a,b)=>b.tables-a.tables||a.name.localeCompare(b.name));
}
export function typedDraft(draft:RuleDraft,column:ColumnChoice|undefined):RuleDraft{
 const f=column?family(column.type):'unsupported';return {...draft,column:column?.name??'',operator:f==='boolean'&&draft.operator!=='<>'?'=':draft.operator,type:f==='number'||f==='float'?'number':f==='boolean'?'boolean':'text'};
}
export function resolvedDraft(draft:RuleDraft,choices:ColumnChoice[]):RuleDraft{return {...typedDraft(draft,choices.find(c=>c.name===draft.column)),extra:draft.extra?.map(d=>typedDraft({...d,all:false},choices.find(c=>c.name===d.column)))};}
export function compatible(columns:CatalogNode[],draft:RuleDraft):boolean{
 if(draft.all)return columns.some(c=>c.kind==='element'&&c.label&&c.exposedType&&family(c.exposedType)!=='unsupported');
 return [draft,...draft.extra??[]].every(d=>{
  const column=columns.find(c=>c.label===d.column);if(!column?.exposedType||d.type==='number'&&!d.value.trim())return false;
  const value=conditionValue(d);if(!PoolRowRule.safeParse(value).success)return false;
  const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"',literal=value.value===null?'NULL':typeof value.value==='string'?"'"+value.value.replaceAll("'","''")+"'":typeof value.value==='boolean'?String(value.value).toUpperCase():String(value.value);
  return parsePredicate(`${quote(value.column)} ${value.operator} ${literal}`,[{id:column.id,name:column.label!,sourceIdentifier:column.label!,type:column.exposedType}]).ok;
 });
}
function ConditionFields({draft,index,choices,onChange}:{draft:ConditionDraft;index:number;choices:ColumnChoice[];onChange:(draft:ConditionDraft)=>void}){
 const column=choices.find(c=>c.name===draft.column),boolean=column&&family(column.type)==='boolean',type=column?.type,inputType=draft.type==='number'?'number':type==='DATE'?'date':type==='TIME'?'time':type==='TIMESTAMP'?'datetime-local':'text',suffix=index?' '+(index+1):'';
 const option=(c:ColumnChoice)=><option key={c.name} value={c.name}>{c.name} · {c.type} · {c.tableNames?.length?c.tableNames.join(', '):`in ${c.tables} of ${c.totalTables??c.tables} ${(c.totalTables??c.tables)===1?'table':'tables'}`}</option>;
 return <div data-creation-rule><label><span><KindIcon kind="column"/>Column</span><Select aria-label={'Row rule column'+suffix} required value={column?.name??''} onChange={e=>{const next=choices.find(c=>c.name===e.target.value);onChange(typedDraft({...draft,all:false,column:e.target.value,operator:'=',value:next&&family(next.type)==='boolean'?'true':''},next));}}><option value="">Choose a column</option><optgroup label="In all selected tables">{choices.filter(c=>c.tables===(c.totalTables??c.tables)).map(option)}</optgroup><optgroup label="In some selected tables">{choices.filter(c=>c.tables!==(c.totalTables??c.tables)).map(option)}</optgroup></Select></label><label>Operator<Select aria-label={'Row rule operator'+suffix} disabled={!column} value={draft.operator} onChange={e=>onChange({...draft,operator:e.target.value as ConditionDraft['operator']})}>{(boolean?['=','<>']:['=','<>','<','<=','>','>=']).map(op=><option key={op}>{op}</option>)}</Select></label><label>Value{boolean?<Select aria-label={'Row rule value'+suffix} value={draft.value} onChange={e=>onChange({...draft,value:e.target.value})}><option value="true">True</option><option value="false">False</option></Select>:<input aria-label={'Row rule value'+suffix} type={inputType} disabled={!column} required={draft.type==='number'||type!=='VARCHAR'} step="any" value={draft.value} onChange={e=>onChange({...draft,value:e.target.value})}/>}</label></div>;
}
export function CreationRows({draft,choices,tables,kinds,onChange}:{draft:RuleDraft;column?:ColumnChoice|undefined;choices:ColumnChoice[];tables:Array<TableColumns&{name:string}>;kinds:Record<string,'table'|'view'>;onChange:(draft:RuleDraft)=>void}){
 const conditions=[draft,...draft.extra??[]];
 const change=(index:number,value:ConditionDraft)=>onChange(index===0?{...draft,...value}:{...draft,extra:(draft.extra??[]).map((d,i)=>i===index-1?value:d)});
 return <><div data-rule-editor><label data-check><Checkbox.Root checked={draft.all} onCheckedChange={checked=>onChange({...draft,all:checked===true})}><Checkbox.Indicator><Glyph name="check" size={16}/></Checkbox.Indicator></Checkbox.Root>All rows · explicit decision</label>{!draft.all&&<>{conditions.length>1&&<label>Match<Select aria-label="Combine conditions" value={draft.combine??'and'} onChange={e=>onChange({...draft,combine:e.target.value as 'and'|'or'})}><option value="and">AND · every condition</option><option value="or">OR · any condition</option></Select></label>}{conditions.map((d,index)=><div data-rule-editor key={index}><ConditionFields draft={d} index={index} choices={choices} onChange={value=>change(index,value)}/>{conditions.length>1&&<button type="button" aria-label={`Remove condition ${index+1}`} onClick={()=>{const rest=conditions.filter((_,i)=>i!==index);onChange({...draft,...rest[0]!,extra:rest.slice(1)});}}>Remove condition</button>}</div>)}<button type="button" disabled={conditions.length>=16} onClick={()=>onChange({...draft,extra:[...draft.extra??[],newRule()]})}>Add condition</button></>}</div><ul data-row-coverage aria-label="Row rule compatibility">{tables.map(table=>{const ok=compatible(table.columns,draft);return <li key={table.tableId} data-status={ok?'ok':'warning'} title={`${table.name} · ${ok?'compatible row rule':'gets no rows until its own rule'}`}><TableIcon kind={kinds[table.tableId]}/><span>{table.name}</span><Glyph name={ok?'check':'warning'} size={16}/>{!ok&&<small>gets no rows until its own rule</small>}</li>;})}</ul></>;
}
