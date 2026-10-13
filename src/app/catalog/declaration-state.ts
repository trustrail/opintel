import { createStore } from 'zustand/vanilla';
import type { DeclarationValues } from '../../shared/api/declarations.js';
type DeclarationForm = {
 open:Record<string,boolean>; toggle:(name:string)=>void;
 stored:DeclarationValues; values:DeclarationValues;
 receive:(stored:DeclarationValues)=>void; saved:(stored:DeclarationValues)=>void; discard:()=>void;
 derivedDomainOpen:boolean; showDerivedDomain:(open:boolean)=>void;
 errors:Record<string,string>; invalid:(errors:Record<string,string>)=>void;
 confirmation:string; edit:(patch:Partial<DeclarationValues>)=>void; confirm:(value:string)=>void;
};
export function createDeclarationForm(stored:DeclarationValues){
 return createStore<DeclarationForm>(set=>({
  open:{},toggle:name=>set(s=>({open:{...s.open,[name]:!s.open[name]}})),
  stored:{...stored},values:{...stored},
  // Refreshed server state updates pristine fields; it never discards a draft
  // or changes which editors the administrator has opened.
  receive:next=>set(state=>{
   const retained=<K extends keyof DeclarationValues>(key:K):DeclarationValues[K]=>state.values[key]===state.stored[key]?next[key]:state.values[key];
   return {stored:{...next},values:{tokenDomain:retained('tokenDomain'),caseInsensitive:retained('caseInsensitive'),sourceTimezone:retained('sourceTimezone'),epochUnit:retained('epochUnit'),canonId:retained('canonId')},confirmation:''};
  }),
  saved:next=>set({stored:{...next},values:{...next},confirmation:'',errors:{}}),
  discard:()=>set(state=>({values:{...state.stored},confirmation:'',errors:{}})),
  derivedDomainOpen:false,showDerivedDomain:derivedDomainOpen=>set({derivedDomainOpen}),
  errors:{},invalid:errors=>set({errors}),confirmation:'',
  edit:patch=>set(state=>({values:{...state.values,...patch},confirmation:'',errors:{}})),
  confirm:confirmation=>set({confirmation}),
 }));
}
export function createSchemaDeclarationForm(zone:string|null){return createStore<{zone:string;confirmation:string;edit:(zone:string)=>void;confirm:(confirmation:string)=>void}>(set=>({zone:zone??'',confirmation:'',edit:zone=>set({zone,confirmation:''}),confirm:confirmation=>set({confirmation})}));}
