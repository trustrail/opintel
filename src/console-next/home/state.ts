import {create} from 'zustand';
export type Order='all'|'decisions'|'running';
export type Theme='light'|'dark';
export const useHomeState=create<{order:Order;theme:Theme;expandedNeed:string|null;toggleNeed:(id:string)=>void;project:string|null;setProject:(project:string)=>void;setOrder:(order:Order)=>void;setTheme:(theme:Theme)=>void}>(set=>({
 order:'all',expandedNeed:null,toggleNeed:id=>set(state=>({expandedNeed:state.expandedNeed===id?null:id})),project:typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('project'),setProject:project=>set({project}),theme:typeof window!=='undefined'&&(new URLSearchParams(window.location.search).get('theme')==='dark'||(!new URLSearchParams(window.location.search).has('theme')&&window.matchMedia('(prefers-color-scheme: dark)').matches))?'dark':'light',
 setOrder:order=>set({order}),setTheme:theme=>set({theme}),
}));
