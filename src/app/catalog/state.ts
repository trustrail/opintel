import { createStore } from 'zustand/vanilla';
export type Branch = { parent: string; prefix: string; cursors: (string | undefined)[] };
export function createExplorerState() {
  return createStore<{
    branches: Record<string, Branch>; expanded: Record<string, boolean>; searchParent: string; scrollTop: number;
    toggle: (id: string) => void; search: (parent: string, prefix: string) => void;
    select: (parent: string) => void; more: (parent: string, cursor: string) => void; scroll: (top: number) => void;
  }>((set) => ({
    branches: { '': { parent: '', prefix: '', cursors: [undefined] } }, expanded: {}, searchParent: '', scrollTop: 0,
    toggle: id => set(state => ({ searchParent: state.expanded[id] ? '' : state.searchParent, expanded: { ...state.expanded, [id]: !state.expanded[id] }, branches: { ...state.branches, [id]: state.branches[id] ?? { parent: id, prefix: '', cursors: [undefined] } } })),
    search: (parent, prefix) => set(state => ({ branches: { ...state.branches, [parent]: { parent, prefix, cursors: [undefined] } }, scrollTop: 0 })),
    select: searchParent => set({ searchParent }), scroll: scrollTop => set({ scrollTop }),
    more: (parent, cursor) => set(state => { const branch = state.branches[parent]; return !branch || branch.cursors.includes(cursor) ? state : { branches: { ...state.branches, [parent]: { ...branch, cursors: [...branch.cursors, cursor] } } }; }),
  }));
}
