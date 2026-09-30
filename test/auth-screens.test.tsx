// @vitest-environment happy-dom

import axe from 'axe-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDeviceScreen, getDeviceNonce } from '../src/app/auth-screens.js';
import { router } from '../src/app/router.js';

function response(body: unknown, status = 200): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'x-request-id': 'req-auth' } });
}

function renderRoute(path: string) {
  const url = new URL(path, window.location.origin);
  void router.navigate({
    to: url.pathname as '/sign-in' | '/check-email' | '/auth/callback' | '/auth/confirm-device',
    search: url.searchParams.has('token') ? { token: url.searchParams.get('token') ?? '' } : {},
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
}

function renderConfirmDevice(token: string) {
  window.history.pushState({}, '', `/auth/confirm-device?token=${token}`);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ConfirmDeviceScreen /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('auth screens', () => {
  it('5.19 enforced SSO retains a uniform administrator recovery option without automatically redirecting',async()=>{
    const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).includes('request-link')?response(undefined,202):response({magicLink:true,providers:[{provider:'oidc:company',displayName:'Company SSO',startPath:'/auth/oidc/oidc:company/start'}],enforced:'oidc:company'}));
    renderRoute('/sign-in');
    await waitFor(()=>expect(screen.getByRole('button',{name:'Request administrator recovery link'})).toBeTruthy());
    expect(screen.getByRole('button',{name:'Continue with Company SSO'})).toBeTruthy();
    expect(screen.getByText(/Only company administrators can receive a recovery link; every use is audited/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'person@example.com'}});
    await waitFor(()=>expect(screen.getByRole('button',{name:'Request administrator recovery link'}).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Request administrator recovery link'}));
    await waitFor(()=>expect(fetcher.mock.calls.some(([input])=>String(input).includes('request-link'))).toBe(true));
  });
  it('creates and preserves the documented 16-byte device nonce', () => {
    const first = getDeviceNonce();
    const second = getDeviceNonce();
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(second).toBe(first);
    expect(window.localStorage.getItem('opintel.device_nonce')).toBe(first);
  });

  it('A-014 and A-015: exposes a logical keyboard sequence with no axe violations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ magicLink: true, providers: [
      { provider: 'oidc:google', displayName: 'Google', startPath: '/auth/oidc/oidc:google/start' },
      { provider: 'oidc:entra', displayName: 'Microsoft', startPath: '/auth/oidc/oidc:entra/start' },
    ], enforced: null }));
    const view = renderRoute('/sign-in');
    const email = await screen.findByLabelText('Email address');
    fireEvent.change(email, { target: { value: 'person@example.com' } });
    await screen.findByRole('button', { name: 'Continue with email' });

    await screen.findByRole('button', {name:'Continue with Google'});
    await screen.findByRole('button', {name:'Continue with Microsoft'});
    const controls = [...view.container.querySelectorAll('input, button')];
    expect(controls.map((control) => control.tagName === 'INPUT' ? control.id : control.textContent)).toEqual([
      'sign-in-email',
      'Continue with email',
      'Continue with Google',
      'Continue with Microsoft',
    ]);
    expect(controls.every((control) => !control.hasAttribute('tabindex') || control.getAttribute('tabindex') !== '-1')).toBe(true);

    const result = await axe.run(view.container);
    expect(result.violations).toEqual([]);
  });

  it('shows magic link alone before resolution and when no OIDC providers are configured',async()=>{
    const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(response({magicLink:true,providers:[],enforced:null}));
    renderRoute('/sign-in');const email=await screen.findByLabelText('Email address');
    expect(screen.queryByRole('button',{name:'Continue with Google'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Continue with Microsoft'})).toBeNull();
    fireEvent.change(email,{target:{value:'person@unconfigured.example'}});
    await waitFor(()=>expect(fetcher).toHaveBeenCalled());
    await waitFor(()=>expect((screen.getByRole('button',{name:'Continue with email'}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('button',{name:'Continue with Google'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Continue with Microsoft'})).toBeNull();
  });

  it('submits the email route through the API client without a document navigation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/auth/providers')) return response({ magicLink: true, providers: [
        { provider: 'oidc:google', displayName: 'Google', startPath: '/auth/oidc/oidc:google/start' },
        { provider: 'oidc:entra', displayName: 'Microsoft', startPath: '/auth/oidc/oidc:entra/start' },
      ], enforced: null });
      return response(undefined, 202);
    });
    const view = renderRoute('/sign-in');
    const email = await screen.findByLabelText('Email address');
    fireEvent.change(email, { target: { value: 'person@example.com' } });
    await screen.findByRole('button', { name: 'Continue with email' });

    const form = view.container.querySelector('form');
    if (form === null) throw new Error('Sign-in form is missing.');
    const submit = createEvent.submit(form, { cancelable: true });
    fireEvent(form, submit);

    expect(submit.defaultPrevented).toBe(true);
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(router.state.location.pathname).toBe('/check-email');
  });

  it('validates the email on blur and submit, then revalidates after it is invalid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ magicLink: true, providers: [], enforced: null }));
    const view = renderRoute('/sign-in');
    const email = await screen.findByLabelText('Email address');
    const continueWithEmail = screen.getByRole('button', { name: 'Continue with email' }) as HTMLButtonElement;
    const reservedMessage = view.container.querySelector('#sign-in-email-error');
    if (reservedMessage === null) throw new Error('Sign-in error message space is missing.');
    expect(reservedMessage.textContent).toBe('\u00a0');

    fireEvent.change(email, { target: { value: 'not-an-email' } });
    expect(screen.queryByText('That does not look like an email address.')).toBeNull();

    fireEvent.blur(email);
    const malformedMessage = await screen.findByText('That does not look like an email address.');
    expect(malformedMessage).toBe(reservedMessage);
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe(malformedMessage.id);
    expect(malformedMessage.id).toBe('sign-in-email-error');
    expect(view.container.querySelector('.fld.err')).not.toBeNull();
    expect(continueWithEmail.disabled).toBe(true);
    expect(screen.queryByRole('button',{name:'Continue with Google'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Continue with Microsoft'})).toBeNull();

    fireEvent.change(email, { target: { value: 'person@example.com' } });
    await waitFor(() => { expect(screen.queryByText('That does not look like an email address.')).toBeNull(); });
    expect(email.getAttribute('aria-invalid')).toBe('false');
    expect(email.getAttribute('aria-describedby')).toBeNull();
    expect(reservedMessage.textContent).toBe('\u00a0');

    fireEvent.change(email, { target: { value: 'still-not-an-email' } });
    await screen.findByText('That does not look like an email address.');

    fireEvent.change(email, { target: { value: '' } });
    const form = view.container.querySelector('form');
    if (form === null) throw new Error('Sign-in form is missing.');
    fireEvent.submit(form);
    const emptyMessage = await screen.findByText('Enter your email address.');
    expect(email.getAttribute('aria-describedby')).toBe(emptyMessage.id);
    expect(continueWithEmail.disabled).toBe(true);
  });

  it('debounces provider lookup and retains prior providers while the next lookup is pending', async () => {
    const firstProvider = { provider: 'oidc:generic', displayName: 'Example SSO', startPath: '/auth/oidc/oidc:generic/start' };
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return response({ magicLink: true, providers: [], enforced: null });
      if (calls === 2) return response({ magicLink: true, providers: [firstProvider], enforced: null });
      return new Promise<Response>(() => {});
    });
    const view = renderRoute('/sign-in');
    const email = await screen.findByLabelText('Email address');

    fireEvent.change(email, { target: { value: 'first@example.com' } });
    await screen.findByRole('button', { name: 'Continue with Example SSO' });

    fireEvent.change(email, { target: { value: 'second@example.com' } });
    fireEvent.change(email, { target: { value: 'third@example.com' } });
    await new Promise<void>((resolve) => { globalThis.setTimeout(resolve, 350); });

    expect(calls).toBe(3);
    expect(screen.getByRole('button', { name: 'Continue with Example SSO' })).toBeTruthy();
    expect(view.container.textContent).not.toContain('Preparing this view');
  });

  it('B-007 and B-008: opens a confirmation prompt after a device mismatch and confirms with the stored nonce', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ deviceMismatch: false }));
    const view = renderConfirmDevice('one-time-token');
    await screen.findByRole('button', { name: 'Yes, confirm this device' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, confirm this device' }));
    await screen.findByRole('heading', { name: 'You are signed in' });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const confirmCall = fetcher.mock.calls[0];
    const options = confirmCall?.[1];
    expect(options?.body).toBe(JSON.stringify({ token: 'one-time-token', deviceNonce: getDeviceNonce(), confirm: true }));
    expect(view.container.textContent).toContain('This device has been confirmed.');
  });

  it('B-009: declines through the same endpoint and consumes the token without creating a session', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ deviceMismatch: false }));
    renderConfirmDevice('declined-token');
    await screen.findByRole('button', { name: 'No, decline this link' });
    fireEvent.click(screen.getByRole('button', { name: 'No, decline this link' }));
    await screen.findByRole('heading', { name: 'Sign-in link declined' });

    await waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(1); });
    const options = fetcher.mock.calls[0]?.[1];
    expect(options?.body).toBe(JSON.stringify({ token: 'declined-token', deviceNonce: getDeviceNonce(), confirm: false }));
    expect(screen.getByText('No session was created. Request a new link when you are ready.')).toBeTruthy();
  });
});
