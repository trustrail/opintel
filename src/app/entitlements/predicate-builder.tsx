import {useEffect,useMemo,useId,type ReactNode} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import type {Predicate,PredicateColumn} from '../../shared/row-scope-contract.js';
import {family,parsePredicate,predicateText} from '../../shared/row-predicate-syntax.js';
import {Button} from '../../shared/ui/index.js';
function ClauseValue({value,change,labelledBy}:{value:string;change:(value:string)=>void;labelledBy:string}){
 const store=useMemo(()=>createStore<{draft:string}>(()=>({draft:value})),[value]);const draft=useStore(store).draft;
 return <input className="inp" aria-labelledby={labelledBy} value={draft} onChange={e=>store.setState({draft:e.target.value})} onBlur={()=>change(draft)}/>;
}
export function PredicateBuilder({value,columns,change}:{value:string;columns:PredicateColumn[];change:(text:string)=>void}){
 const prefixId=useId();let condition=0;
 const header=(name:string)=>`${prefixId}-${name}`;
 const parsed=useMemo(()=>parsePredicate(value,columns),[value,columns]);
 const memory=useMemo(()=>createStore<{last:Predicate|null}>(()=>({last:null})),[columns]);
 const last=useStore(memory).last;
 useEffect(()=>{if(parsed.ok)memory.setState({last:parsed.value});},[parsed,memory]);
 const tree=parsed.ok?parsed.value:last;
 const first=columns.find(c=>family(c.type)!=='unsupported');
 const starter=first?predicateText({kind:'null',column:first.id,negated:true},columns):'';
 function node(p:Predicate,set:(next:Predicate)=>void,path:string):ReactNode{
  if(p.kind==='and'||p.kind==='or')return <fieldset><legend><span className="ichip">{p.kind.toUpperCase()} group · ( … )</span></legend><div className="filters">{(['and','or'] as const).map(kind=><button type="button" className="gchip" key={kind} aria-pressed={p.kind===kind} onClick={()=>set({...p,kind})}>{kind.toUpperCase()}</button>)}</div>{p.terms.map((t,i)=><div className="seg" key={i}>{node(t,next=>set({...p,terms:p.terms.map((v,n)=>n===i?next:v)}),`${path}.${i+1}`)}<Button variant="ghost" onClick={()=>set(p.terms.length===2?p.terms[1-i]!: {...p,terms:p.terms.filter((_,n)=>n!==i)})}>Remove clause {i+1}</Button></div>)}<Button variant="ghost" onClick={()=>set({...p,terms:[...p.terms,{kind:'null',column:first!.id,negated:true}]})}>Add clause</Button></fieldset>;
  if(p.kind==='not')return <fieldset><legend><span className="ichip">NOT ( … )</span></legend>{node(p.term,term=>set({...p,term}),path+'.not')}<Button variant="ghost" onClick={()=>set(p.term)}>Remove NOT</Button></fieldset>;
  if(p.kind==='scope')return <p role="alert">scope references arrive in step 3</p>;
  const rowId=`${prefixId}-condition-${path}`,index=++condition;
  const label=(name:string)=>`${header(name)} ${rowId}`;
  const c=columns.find(c=>c.id===p.column)!;const operators=family(c.type)==='boolean'?['=','<>','IN','IS NULL','IS NOT NULL']:['=','<>','<','<=','>','>=','IN','IS NULL','IS NOT NULL'];
  const operator=p.kind==='null'?p.negated?'IS NOT NULL':'IS NULL':p.kind==='in'?'IN':p.operator;
  const prefix='"'+c.name.replaceAll('"','""')+'" ';
  const edit=(op:string,literal:string)=>{const text=prefix+op+(op.startsWith('IS ')?'':' '+literal),next=parsePredicate(text,columns);if(next.ok)set(next.value);else change(rawReplace(tree?predicateText(tree,columns):value,predicateText(p,columns),text));};
  return <div><span id={rowId} hidden>condition {index}</span><div className="filters" data-part="predicate-row"><select className="sel" aria-labelledby={label('column')} value={c.id} onChange={e=>set({kind:'null',column:e.target.value,negated:true})}>{columns.filter(c=>family(c.type)!=='unsupported').map(c=><option key={c.id} value={c.id}>{c.name} · {c.type}</option>)}</select><select className="sel" aria-labelledby={label('operator')} value={operator} onChange={e=>{const op=e.target.value;edit(op,op==='IN'?'(NULL)':'NULL');}}>{operators.map(op=><option key={op}>{op}</option>)}</select>{p.kind==='compare'?<ClauseValue labelledBy={label('value')} value={p.value??''} change={v=>edit(operator,literal(v,c))}/>:p.kind==='in'?<div>{p.values.map((v,i)=><div className="filters" key={i}><ClauseValue labelledBy={label('value')} value={v??''} change={text=>edit(operator,'('+p.values.map((old,n)=>n===i?literal(text,c):old===null?'NULL':literal(old,c)).join(', ')+')')}/>{p.values.length>1?<Button variant="ghost" onClick={()=>set({...p,values:p.values.filter((_,n)=>n!==i)})}>Remove value {i+1}</Button>:null}</div>)}<Button variant="ghost" onClick={()=>set({...p,values:[...p.values,null]})}>Add value</Button></div>:<span>Not needed</span>}</div><p className="note">{c.type} · Typed value{family(c.type)==='text'?' · exact text, no trimming':family(c.type)==='time'?' · ISO 8601':''}{c.type==='FLOAT'||c.type==='DOUBLE'?' · equality is rarely intended':''}</p><div className="filters"><button type="button" className="gchip" onClick={()=>set({kind:'and',terms:[p,{kind:'null',column:first!.id,negated:true}]})}>AND group</button><button type="button" className="gchip" onClick={()=>set({kind:'or',terms:[p,{kind:'null',column:first!.id,negated:true}]})}>OR group</button><button type="button" className="gchip" onClick={()=>set({kind:'not',term:p})}>NOT</button></div></div>;
 }
 if(!first)return <p>No supported scalar columns are available.</p>;
 return <div role="group" aria-label="Predicate builder" data-part="predicate-builder"><div className="note" data-part="predicate-header"><span id={header('column')}>Column</span><span id={header('operator')}>Operator</span><span id={header('value')}>Value</span></div>{!parsed.ok&&value?<p role="alert">{parsed.error.message}</p>:null}{tree?node(tree,p=>change(predicateText(p,columns)),'1'):<><p>Choose a column to begin.</p><Button variant="ghost" onClick={()=>change(starter)}>Start predicate</Button></>}<p className="mono" style={{overflowWrap:'anywhere'}}>{value}</p></div>;
}
function rawReplace(text:string,before:string,after:string){return text.includes(before)?text.replace(before,after):after;}

function literal(value:string,column:PredicateColumn){return ['text','time','uuid'].includes(family(column.type))?"'"+value.replaceAll("'","''")+"'":value;}
