import { create } from 'zustand';

export type AccessFilter = 'all' | 'project' | 'company';
export const useAccessUi = create<{
  projectId: string | null; selectedId: string | null; filter: AccessFilter; traceMemberId: string | null;
  select(projectId: string, userId: string): void;
  show(projectId: string, filter: AccessFilter): void;
  toggleTrace(userId: string): void;
}>((set) => ({
  projectId: null, selectedId: null, filter: 'all', traceMemberId: null,
  select: (projectId, userId) => set((state) => ({
    projectId, selectedId: state.projectId === projectId && state.selectedId === userId ? null : userId,
    filter: state.projectId === projectId ? state.filter : 'all',
  })),
  show: (projectId, filter) => set({ projectId, filter, selectedId: null, traceMemberId: null }),
  toggleTrace: (userId) => set((state) => ({ traceMemberId: state.traceMemberId === userId ? null : userId })),
}));
