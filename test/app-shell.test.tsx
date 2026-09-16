// @vitest-environment happy-dom

import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteErrorBoundary } from '../src/app/error-boundary.js';
import { labelForPath, navGroups } from '../src/app/navigation.js';
import { router } from '../src/app/router.js';
import { ToastHost } from '../src/app/toast.js';
import { RouterProvider } from '@tanstack/react-router';

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
    render(<RouterProvider router={router} />);
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
  });
});
