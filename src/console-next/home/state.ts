import {create} from 'zustand';
export type Order='all'|'decisions'|'running';
export type Theme='light'|'dark';
export const useHomeState=create<{order:Order;theme:Theme;showAllNeeds:boolean;toggleAllNeeds:()=>void;expandedNeed:string|null;toggleNeed:(id:string)=>void;project:string|null;setProject:(project:string)=>void;setOrder:(order:Order)=>void;setTheme:(theme:Theme)=>void}>(set=>({
 order:'all',showAllNeeds:false,toggleAllNeeds:()=>set(state=>({showAllNeeds:!state.showAllNeeds})),expandedNeed:null,toggleNeed:id=>set(state=>({expandedNeed:state.expandedNeed===id?null:id})),project:typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('project'),setProject:project=>set({project,showAllNeeds:false}),theme:typeof window!=='undefined'&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',
 setOrder:order=>set({order}),setTheme:theme=>set({theme}),
}));
