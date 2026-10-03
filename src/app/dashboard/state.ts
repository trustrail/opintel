import { create } from 'zustand';

export const useDashboardDisclosure = create<{
  expanded: Record<string, boolean>;
  toggle(projectId: string, disclosureId: string): void;
}>((set) => ({
  expanded: {},
  toggle: (projectId, disclosureId) => {
    const key = `${projectId}:${disclosureId}`;
    set((state) => ({ expanded: { ...state.expanded, [key]: !state.expanded[key] } }));
  },
}));
