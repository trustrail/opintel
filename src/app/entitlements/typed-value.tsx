import {useMemo} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import {family,typedLiteral} from '../../shared/row-predicate-syntax.js';
export function normalizeControlValue(value:string,type:string):string{if(type==='TIMESTAMPTZ')return normalizeControlValue(value,'TIMESTAMP')+'Z';if(type==='TIME'&&/^\d{2}:\d{2}$/u.test(value))return value+':00';if(type==='TIMESTAMP'&&/T\d{2}:\d{2}$/u.test(value))return value+':00';return value;}
export function controlValueError(value:string,type:string){try{const f=family(type);typedLiteral(normalizeControlValue(value,type),f==='number'||f==='float'?'number':f==='boolean'?'word':'string',type);return null;}catch(error){return error instanceof Error?error.message:'Invalid value for this column type.';}}
export function TypedValue({value,type,change,labelledBy}:{value:string;type:string;change:(value:string)=>void;labelledBy:string}){
 const store=useMemo(()=>createStore<{draft:string;error:string|null}>(()=>({draft:type==='TIMESTAMPTZ'?value.replace(/Z$/u,''):value,error:null})),[value,type]),s=useStore(store),f=family(type);
 if(f==='boolean')return <select className="inp" aria-labelledby={labelledBy} value={s.draft} onChange={e=>{store.setState({draft:e.target.value});change(e.target.value);}}><option value="" disabled>Choose true or false</option><option value="true">True</option><option value="false">False</option></select>;
 const inputType=type==='DATE'?'date':type==='TIME'?'time':type==='TIMESTAMP'||type==='TIMESTAMPTZ'?'datetime-local':f==='number'||f==='float'?'number':'text';
 return <div><input className="inp" aria-labelledby={labelledBy} aria-invalid={!!s.error} type={inputType} step={f==='time'?'0.000001':/INT$/u.test(type)?'1':'any'} min={type==='DATE'?'0001-01-01':undefined} max={type==='DATE'?'9999-12-31':undefined} pattern={f==='uuid'?'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}':undefined} value={s.draft} onChange={e=>{const error=controlValueError(e.target.value,type);e.target.setCustomValidity(error??'');store.setState({draft:e.target.value,error});}} onBlur={()=>change(normalizeControlValue(s.draft,type))}/>{type==='TIMESTAMPTZ'?<span className="note">UTC · explicit Z offset</span>:null}{s.error?<p role="alert">{s.error}</p>:null}</div>;
}
