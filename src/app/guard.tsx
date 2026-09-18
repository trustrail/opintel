import { useQuery } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { createApiClient, type AppError } from '../shared/api/index.js';
import { AppRoot, ErrorState, LoadingState } from '../shared/ui/index.js';

const returnToKey = 'opintel.return_to';
const currentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  timezone: z.string(),
  method: z.string(),
  sessionCreatedAt: z.string(),
  deviceConfirmed: z.boolean(),
});

export const authKeys = {
  currentUser: () => ['auth', 'current-user'] as const,
};

const api = createApiClient();

function validReturnTo(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export function rememberReturnTo(path: string | null, storage: Storage = globalThis.localStorage): void {
  if (path !== null && validReturnTo(path)) storage.setItem(returnToKey, path);
}

export function completeReturnTo(storage: Storage = globalThis.localStorage): string {
  const path = storage.getItem(returnToKey);
  storage.removeItem(returnToKey);
  return path !== null && validReturnTo(path) ? path : '/';
}

function GuardState({ children }: { readonly children: ReactNode }): ReactNode {
  return <AppRoot><main className="authpage"><LoadingState />{children}</main></AppRoot>;
}

export function AuthGuard({ children, intendedPath }: { readonly children: ReactNode; readonly intendedPath: string }): ReactNode {
  const currentUser = useQuery<z.infer<typeof currentUserSchema>, AppError>({
    queryKey: authKeys.currentUser(),
    retry: false,
    queryFn: async () => {
      const result = await api.request({ path: '/api/v1/auth/me', response: currentUserSchema });
      if (!result.ok) throw result.error;
      return result.value;
    },
  });

  if (currentUser.isPending) return <GuardState><span /></GuardState>;
  if (currentUser.isError) {
    if (currentUser.error.code === 'unauthenticated') {
      rememberReturnTo(intendedPath);
      return <Navigate replace search={{ next: intendedPath }} to="/sign-in" />;
    }
    return <AppRoot><main className="authpage"><ErrorState description={currentUser.error.message} retry={() => { void currentUser.refetch(); }} title="We could not verify your session" /></main></AppRoot>;
  }
  return children;
}
