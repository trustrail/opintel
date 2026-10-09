import { createStore } from 'zustand/vanilla';
export type Branch = { parent: string; prefix: string; cursors: (string | undefined)[] };
export function createExplorerState() {
  return createStore<{
    width:number;setWidth:(width:number)=>void;sourceId:string;filter:'all'|'undecided'|'declared';panelHeight:number;setPanelHeight:(height:number)=>void;chooseSource:(id:string)=>void;setFilter:(filter:'all'|'undecided'|'declared')=>void;branches: Record<string, Branch>; expanded: Record<string, boolean>; searchParent: string; scrollTop: number;
    toggle: (id: string) => void; search: (parent: string, prefix: string) => void;
    select: (parent: string) => void; more: (parent: string, cursor: string) => void; scroll: (top: number) => void;
  }>((set) => ({
    width:0,setWidth:width=>set({width}),sourceId:'',filter:'all',panelHeight:650,setPanelHeight:panelHeight=>set({panelHeight}),chooseSource:sourceId=>set({sourceId,branches:{},expanded:{},searchParent:'',scrollTop:0}),setFilter:filter=>set(s=>({filter,scrollTop:0,branches:Object.fromEntries(Object.entries(s.branches).map(([id,b])=>[id,{...b,cursors:[undefined]}]))})),branches: { '': { parent: '', prefix: '', cursors: [undefined] } }, expanded: {}, searchParent: '', scrollTop: 0,
    toggle: id => set(state => ({ searchParent: state.expanded[id] ? '' : state.searchParent, expanded: { ...state.expanded, [id]: !state.expanded[id] }, branches: { ...state.branches, [id]: state.branches[id] ?? { parent: id, prefix: '', cursors: [undefined] } } })),
    search: (parent, prefix) => set(state => ({ branches: { ...state.branches, [parent]: { parent, prefix, cursors: [undefined] } }, scrollTop: 0 })),
    select: searchParent => set({ searchParent }), scroll: scrollTop => set({ scrollTop }),
    more: (parent, cursor) => set(state => { const branch = state.branches[parent]; return !branch || branch.cursors.includes(cursor) ? state : { branches: { ...state.branches, [parent]: { ...branch, cursors: [...branch.cursors, cursor] } } }; }),
  }));
}
