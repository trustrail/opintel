// @vitest-environment happy-dom

import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteErrorBoundary } from '../src/app/error-boundary.js';
import { labelForPath, navGroups } from '../src/app/navigation.js';
import { router } from '../src/app/router.js';
import { ToastHost } from '../src/app/toast.js';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('application shell contracts', () => {
  it('ports all five navigation groups and their console items', () => {
    expect(navGroups.map((group) => group.label)).toEqual(['Watch', 'Work', 'Understand', 'Govern', 'Manage']);
    expect(navGroups.flatMap((group) => group.items).map((item) => item.label)).toContain('Dashboard');
    expect(navGroups.flatMap((group) => group.items).map((item) => item.label)).toContain('Settings');
    expect(navGroups.flatMap((group) => group.items).every((item) => item.count === undefined)).toBe(true);
  });

  it('derives the top-bar breadcrumb label from the route', () => {
    expect(labelForPath('/entitlements')).toBe('Entitlements');
    expect(labelForPath('/')).toBe('Dashboard');
  });

  it('renders the existing toast host and route boundary fallback contract', () => {
    const toast = renderToStaticMarkup(<ToastHost><span>Page</span></ToastHost>);
    const boundary = renderToStaticMarkup(<RouteErrorBoundary><span>Page</span></RouteErrorBoundary>);
    expect(toast).toContain('class="toast"');
    expect(toast).toContain('role="status"');
    expect(boundary).toContain('Page');
  });

  it('collapses and expands from visible controls in the rendered shell', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: '018f8f9d-7f83-7abc-8def-0123456789ab', email: 'person@example.com', fullName: null,
      timezone: 'UTC', method: 'magic_link', sessionCreatedAt: '2026-01-01T00:00:00.000Z', deviceConfirmed: false,
    }), { status: 200, headers: { 'x-request-id': 'req-shell' } }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
    const collapseButton = await screen.findByRole('button', { name: 'Collapse menu' });
    const shell = document.querySelector('#opintel-app > .shell');
    expect(shell?.className).toBe('shell');
    expect(document.querySelector('.dnav .pill')).toBeNull();

    fireEvent.click(collapseButton);
    expect(shell?.className).toBe('shell collapsed');

    const expandButton = screen.getByRole('button', { name: 'Expand menu' });
    expect(expandButton.className).toBe('dtoggle');
    fireEvent.click(expandButton);
    expect(shell?.className).toBe('shell');
    fetcher.mockRestore();
  });
});
