import {Select} from '../components/select.js';
import type {CatalogNode} from '../../shared/api/catalog.js';
import {family,parsePredicate} from '../../shared/row-predicate-syntax.js';
import {PoolRowRule} from '../../shared/api/pool-tables.js';
import {KindIcon,TableIcon,Glyph} from '../components/kind.js';
import {Checkbox} from '../components/primitives.js';
import {ruleValue,type RuleDraft} from './commands.js';
export type TableColumns={tableId:string;columns:CatalogNode[]};
export type ColumnChoice={name:string;type:string;tables:number};
export function columnChoices(tables:TableColumns[]):ColumnChoice[]{
 const names=new Map<string,Map<string,number>>();
 for(const table of tables){for(const column of table.columns){if(column.kind!=='element'||!column.label||!column.exposedType||family(column.exposedType)==='unsupported')continue;const types=names.get(column.label)??new Map<string,number>();types.set(column.exposedType,(types.get(column.exposedType)??0)+1);names.set(column.label,types);}}
 return [...names].map(([name,types])=>({name,type:[...types].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]![0],tables:tables.filter(t=>t.columns.some(c=>c.label===name)).length})).sort((a,b)=>b.tables-a.tables||a.name.localeCompare(b.name));
}
export function typedDraft(draft:RuleDraft,column:ColumnChoice|undefined):RuleDraft{
 const f=column?family(column.type):'unsupported';return {...draft,column:column?.name??'',operator:f==='boolean'&&draft.operator!=='<>'?'=':draft.operator,type:f==='number'||f==='float'?'number':f==='boolean'?'boolean':'text'};
}
export function compatible(columns:CatalogNode[],draft:RuleDraft){
 if(draft.all)return columns.some(c=>c.kind==='element'&&c.label&&c.exposedType&&family(c.exposedType)!=='unsupported');
 const column=columns.find(c=>c.label===draft.column);if(!column?.exposedType)return false;
 if(draft.type==='number'&&!draft.value.trim())return false;
 const value=ruleValue(draft);if(!PoolRowRule.safeParse(value).success||'allRows' in value)return false;
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"',literal=typeof value.value==='string'?"'"+value.value.replaceAll("'","''")+"'":typeof value.value==='boolean'?String(value.value).toUpperCase():String(value.value);
 return parsePredicate(`${quote(value.column)} ${value.operator} ${literal}`,[{id:column.id,name:column.label!,sourceIdentifier:column.label!,type:column.exposedType}]).ok;
}
export function CreationRows({draft,column,choices,tables,kinds,onChange}:{draft:RuleDraft;column:ColumnChoice|undefined;choices:ColumnChoice[];tables:Array<TableColumns&{name:string}>;kinds:Record<string,'table'|'view'>;onChange:(draft:RuleDraft)=>void}){
 const boolean=column&&family(column.type)==='boolean',type=column?.type,inputType=draft.type==='number'?'number':type==='DATE'?'date':type==='TIME'?'time':type==='TIMESTAMP'?'datetime-local':'text';
 return <><div data-rule-editor><label data-check><Checkbox.Root checked={draft.all} onCheckedChange={checked=>onChange({...draft,all:checked===true})}><Checkbox.Indicator><Glyph name="check" size={16}/></Checkbox.Indicator></Checkbox.Root>All rows · explicit decision</label>{!draft.all&&<div data-creation-rule><label><span><KindIcon kind="column"/>Column</span><Select aria-label="Row rule column" required value={column?.name??''} onChange={e=>{const next=choices.find(c=>c.name===e.target.value);onChange(typedDraft({...draft,column:e.target.value,operator:'=',value:next&&family(next.type)==='boolean'?'true':''},next));}}><option value="">Choose a column</option>{choices.map(c=><option key={c.name} value={c.name}>{c.name} · {c.type}</option>)}</Select></label><label>Operator<Select aria-label="Row rule operator" disabled={!column} value={draft.operator} onChange={e=>onChange({...draft,operator:e.target.value as RuleDraft['operator']})}>{(boolean?['=','<>']:['=','<>','<','<=','>','>=']).map(op=><option key={op}>{op}</option>)}</Select></label><label>Value{boolean?<Select aria-label="Row rule value" value={draft.value} onChange={e=>onChange({...draft,value:e.target.value})}><option value="true">True</option><option value="false">False</option></Select>:<input aria-label="Row rule value" type={inputType} disabled={!column} required={draft.type==='number'||type!=='VARCHAR'} step="any" value={draft.value} onChange={e=>onChange({...draft,value:e.target.value})}/>}</label></div>}</div><ul data-row-coverage aria-label="Row rule compatibility">{tables.map(table=>{const ok=compatible(table.columns,draft);return <li key={table.tableId} data-status={ok?'ok':'warning'} title={`${table.name} · ${ok?'compatible row rule':'gets no rows until its own rule'}`}><TableIcon kind={kinds[table.tableId]}/><span>{table.name}</span><Glyph name={ok?'check':'warning'} size={16}/>{!ok&&<small>gets no rows until its own rule</small>}</li>;})}</ul></>;
}
