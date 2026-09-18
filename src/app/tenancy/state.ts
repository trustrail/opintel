import { create } from 'zustand';

type FormState = { name: string; companyId: string; industryId: string; region: string; changeCompany: boolean };
const empty: FormState = { name: '', companyId: '', industryId: '', region: '', changeCompany: false };
export const useProjectForm = create<FormState & { set(value: Partial<FormState>): void; reset(): void }>((set) => ({ ...empty, set, reset: () => set(empty) }));
export const useCompanyForm = create<Omit<FormState, 'companyId' | 'changeCompany'> & { set(value: Partial<FormState>): void; reset(): void }>((set) => ({ name: '', industryId: '', region: '', set, reset: () => set({ name: '', industryId: '', region: '' }) }));
export const useShellUi = create<{ collapsed: boolean; switcherOpen: boolean; toggle(): void; open(value: boolean): void }>((set) => ({
  collapsed: false, switcherOpen: false,
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  open: (switcherOpen) => set({ switcherOpen }),
}));
