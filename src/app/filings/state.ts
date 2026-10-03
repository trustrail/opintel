import { create } from 'zustand';

export const useResolutionDisclosure = create<{
  expanded: Record<string, boolean>;
  toggle(key: string): void;
}>(set => ({
  expanded: {},
  toggle: key => set(state => ({ expanded: { ...state.expanded, [key]: !state.expanded[key] } })),
}));
