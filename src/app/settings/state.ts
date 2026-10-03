import { create } from 'zustand';

export const useMigrationDisclosure = create<{
  expanded: Record<string, boolean>;
  toggle(projectId: string): void;
}>(set => ({
  expanded: {},
  toggle: projectId => set(state => ({ expanded: { ...state.expanded, [projectId]: !state.expanded[projectId] } })),
}));
