// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeReturnTo, rememberReturnTo } from '../src/app/guard.js';
import { router } from '../src/app/router.js';

function renderRouter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('console authentication guard', () => {
  it('redirects an unauthenticated console visit to sign-in and preserves the requested path', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      error: { code: 'unauthenticated', message: 'Sign in is required.', requestId: 'req-guard', retryable: false },
    }), { status: 401, headers: { 'x-request-id': 'req-guard' } }));
    void router.navigate({ to: '/vocabulary' });
    renderRouter();

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toMatchObject({ next: '/vocabulary' });
    expect(completeReturnTo()).toBe('/vocabulary');
  });

  it('redirects the project chooser to sign-in when there is no session', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      error: { code: 'unauthenticated', message: 'Sign in is required.', requestId: 'req-guard', retryable: false },
    }), { status: 401, headers: { 'x-request-id': 'req-guard' } }));
    void router.navigate({ to: '/projects' });
    renderRouter();

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toMatchObject({ next: '/projects' });
  });

  it('allows a console route when /auth/me returns the assembled current user', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '018f8f9d-7f83-7abc-8def-0123456789ab', email: 'person@example.com', fullName: null,
      timezone: 'UTC', method: 'magic_link', sessionCreatedAt: '2026-01-01T00:00:00.000Z', deviceConfirmed: false,
    }), { status: 200, headers: { 'x-request-id': 'req-guard' } }));
    void router.navigate({ to: '/' });
    renderRouter();

    expect(await screen.findByRole('button', { name: 'Collapse menu' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Your projects' })).toBeTruthy();
  });

  it('restores only an internal intended path after sign-in', () => {
    rememberReturnTo('/pools?tab=keys');
    expect(completeReturnTo()).toBe('/pools?tab=keys');
    rememberReturnTo('//untrusted.example');
    expect(completeReturnTo()).toBe('/');
  });
});
