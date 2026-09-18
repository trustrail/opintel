import { create } from 'zustand';

export type AccessFilter = 'all' | 'project' | 'company';
export const useAccessUi = create<{
  projectId: string | null; selectedId: string | null; filter: AccessFilter;
  select(projectId: string, userId: string): void;
  show(projectId: string, filter: AccessFilter): void;
}>((set) => ({
  projectId: null, selectedId: null, filter: 'all',
  select: (projectId, userId) => set((state) => ({
    projectId, selectedId: state.projectId === projectId && state.selectedId === userId ? null : userId,
    filter: state.projectId === projectId ? state.filter : 'all',
  })),
  show: (projectId, filter) => set({ projectId, filter, selectedId: null }),
}));
