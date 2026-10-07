import { createStore } from 'zustand/vanilla';
export type Branch = { parent: string; prefix: string; cursors: (string | undefined)[] };
export function createEntitlementsState() {
  return createStore<{
    pendingGroup:string|null;queueGroup:(group:string|null)=>void;namePrefix:string;filterName:(prefix:string)=>void;groupMembers:Record<string,string[]>; rememberMembers:(members:readonly {id:string;group:string}[])=>void; selected: ReadonlySet<string>; treatment: 'clear'|'tokenized'|'masked'|'aggregate_only'|'withheld'; maskKind:'all'|'last4'|'email'|'year'; justification:string; requestKey:string;
    check:(ids:string[],checked:boolean)=>void; clearSelection:()=>void; form:(patch:Partial<{treatment:'clear'|'tokenized'|'masked'|'aggregate_only'|'withheld';maskKind:'all'|'last4'|'email'|'year';justification:string}>)=>void;
    branches: Record<string, Branch>; expanded: Record<string, boolean>; searchParent: string; scrollTop: number;
    toggle: (id: string) => void; search: (parent: string, prefix: string) => void;
    select: (parent: string) => void; more: (parent: string, cursor: string) => void; scroll: (top: number) => void;
  }>((set) => ({
    pendingGroup:null,queueGroup:pendingGroup=>set({pendingGroup}),namePrefix:'',filterName:namePrefix=>set({namePrefix,selected:new Set(),requestKey:crypto.randomUUID()}),groupMembers:{},rememberMembers:members=>set(state=>{const groupMembers={...state.groupMembers};for(const member of members){const ids=groupMembers[member.group]??[];if(!ids.includes(member.id))groupMembers[member.group]=[...ids,member.id];}return {groupMembers};}),selected:new Set(),treatment:'withheld',maskKind:'all',justification:'',requestKey:crypto.randomUUID(),
    check:(ids,checked)=>set(state=>{const selected=new Set(state.selected);for(const id of ids)if(checked)selected.add(id);else selected.delete(id);return {selected,requestKey:crypto.randomUUID()};}),
    clearSelection:()=>set({selected:new Set(),requestKey:crypto.randomUUID()}),form:patch=>set({...patch,requestKey:crypto.randomUUID()}),
    branches: { '': { parent: '', prefix: '', cursors: [undefined] } }, expanded: {}, searchParent: '', scrollTop: 0,
    toggle: id => set(state => ({ searchParent: state.expanded[id] ? '' : state.searchParent, expanded: { ...state.expanded, [id]: !state.expanded[id] }, branches: { ...state.branches, [id]: state.branches[id] ?? { parent: id, prefix: '', cursors: [undefined] } } })),
    search: (parent, prefix) => set(state => ({ branches: { ...state.branches, [parent]: { parent, prefix, cursors: [undefined] } }, scrollTop: 0 })),
    select: searchParent => set({ searchParent }), scroll: scrollTop => set({ scrollTop }),
    more: (parent, cursor) => set(state => { const branch = state.branches[parent]; return !branch || branch.cursors.includes(cursor) ? state : { branches: { ...state.branches, [parent]: { ...branch, cursors: [...branch.cursors, cursor] } } }; }),
  }));
}
