import {create} from 'zustand';
export type Section='engines'|'custody'|'tls'|'mail'|'people'|'token'|'query'|'evidence'|'discovery';
const initial=typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('section');
const sections:Section[]=['engines','custody','tls','mail','people','token','query','evidence','discovery'];
export const useSettingsState=create<{section:Section;opened:boolean;role:string|null;select:(s:Section)=>void;back:()=>void;setRole:(r:string|null)=>void}>(set=>({section:sections.find(s=>s===initial)??'custody',opened:Boolean(initial),role:null,select:section=>{set({section,opened:true,role:null});const u=new URL(window.location.href);u.searchParams.set('section',section);window.history.replaceState(null,'',u);},back:()=>{set({opened:false});const u=new URL(window.location.href);u.searchParams.delete('section');window.history.replaceState(null,'',u);},setRole:role=>set({role})}));
