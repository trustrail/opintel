import {test} from './fixtures.js';
import { expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import { z } from 'zod';
import { ExplainResponse, ProjectMemberListItem } from '../src/shared/api/tenancy-schemas.js';
import { projectPermissions } from '../src/modules/tenancy/application/explain-permissions.js';

test.use({ launchOptions: { args: ['--disable-gpu'] } });
const projectId = '018f8f9d-7f83-7abc-8def-000000000001';
const companyId = '018f8f9d-7f83-7abc-8def-000000000002';
const nextProjectId = '018f8f9d-7f83-7abc-8def-000000000003';
const ids = ['018f8f9d-7f83-7abc-8def-000000000011', '018f8f9d-7f83-7abc-8def-000000000012', '018f8f9d-7f83-7abc-8def-000000000013'];
const members: z.infer<typeof ProjectMemberListItem>[] = [
  { user: { id: ids[0]!, email: 'rita@example.com', fullName: 'Rita Kowalski' }, projectRole: 'operator', companyRole: null, via: 'project', grantedAt: '2026-03-04T00:00:00.000Z', grantedBy: { id: ids[1]!, email: 'joseph@example.com' } },
  { user: { id: ids[1]!, email: 'joseph@example.com', fullName: 'Joseph Mensah' }, projectRole: null, companyRole: 'admin', via: 'company', grantedAt: null, grantedBy: null },
  { user: { id: ids[2]!, email: 'dara@example.com', fullName: 'Dara Okafor' }, projectRole: 'viewer', companyRole: 'admin', via: 'both', grantedAt: '2026-06-19T00:00:00.000Z', grantedBy: { id: ids[1]!, email: 'joseph@example.com' } },
];
const project = { id: projectId, name: 'Treaty Book', company: { id: companyId, name: 'Harbor Re' }, industry: { id: companyId, name: 'Reinsurance Treaty' }, region: 'eu-west-1', role: 'admin' };

async function api(page: Page) {
  const state = { listError: false, explainError: false, empty: false, emptyPermissions: false, explanations: [] as string[], cursors: [] as string[], projects: [project, { ...project, id: nextProjectId, name: 'Claims Review' }] };
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const fail = async (message: string) => route.fulfill({ status: 503, json: { error: { code: 'dependency_unavailable', message, requestId: 'access-test', retryable: true } } });
    if (path.endsWith('/auth/me')) { await route.fulfill({ json: { id: ids[1], email: 'joseph@example.com', fullName: 'Joseph Mensah', timezone: 'UTC', method: 'magic_link', sessionCreatedAt: '2026-01-01T00:00:00.000Z', deviceConfirmed: true } }); return; }
    if (path.endsWith('/projects')) { await route.fulfill({ json: { items: state.projects, nextCursor: null } }); return; }
    if (path.endsWith('/members')) {
      state.cursors.push(url.searchParams.get('cursor') ?? 'first');
      if (state.listError) { await fail('Members are temporarily unavailable.'); return; }
      if (state.empty || path.includes(nextProjectId)) { await route.fulfill({ json: { items: [], nextCursor: null } }); return; }
      await route.fulfill({ json: { items: url.searchParams.has('cursor') ? members.slice(2) : members.slice(0, 2), nextCursor: url.searchParams.has('cursor') ? null : 'next' } }); return;
    }
    if (path.endsWith('/explain')) {
      const member = members.find((item) => path.includes(item.user.id));
      if (!member) throw new Error('Unknown person.');
      state.explanations.push(member.user.id);
      if (state.explainError) { await fail('Permissions are temporarily unavailable.'); return; }
      const body: z.infer<typeof ExplainResponse> = {
        user: member.user, projectRole: member.projectRole, companyRole: member.companyRole,
        checkedAt: '2026-09-18T12:00:00.000Z', token: 'test-revision',
        permissions: state.emptyPermissions ? [] : projectPermissions.map((permission) => {
          const allowed = member.companyRole === 'admin' || ['view', 'export_evidence', 'simulate', 'ack_observation'].includes(permission);
          return { permission, allowed, via: !allowed ? 'none' : member.projectRole !== null ? 'project' : 'company', path: [] };
        }),
      };
      await route.fulfill({ json: body }); return;
    }
    await route.fulfill({ status: 404, json: {} });
  });
  return state;
}

for (const width of [390, 900, 1440]) {
  test(`E-009: Access keyboard, axe and snapshot at ${width}`, { tag: '@visual' }, async ({ page }) => {
    const state = await api(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/projects/${projectId}/access`);
    await expect(page.getByRole('button', { name: /Dara Okafor/ })).toBeVisible();
    expect(state.explanations).toEqual([]);
    expect(state.cursors).toEqual(['first', 'next']);
    const joseph = page.getByRole('button', { name: /Joseph Mensah/ });
    await joseph.focus(); await page.keyboard.press('Enter');
    await expect(joseph).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Allowed · Inherited from Harbor Re' })).toContainText('Set entitlements');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('heading', { name: 'Access', exact: true }).click();
    await expect(page).toHaveScreenshot(`access-${width}.png`, { animations: 'disabled', fullPage: true });
    await page.addScriptTag({ content: axe.source });
    expect(await page.evaluate(async () => (await axe.run()).violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => ({ target: node.target, message: node.failureSummary })) })))).toEqual([]);
  });
}

test('E-009: distinguishes three people, both survives revocation, and thin traces do not change verdicts', async ({ page }) => {
  const state = await api(page);
  await page.goto(`/projects/${projectId}/access`);
  await page.getByRole('button', { name: /Rita Kowalski/ }).click();
  await expect(page.getByRole('region', { name: 'Allowed · Direct project grant', exact: true })).toContainText('Export evidence');
  await expect(page.getByRole('region', { name: 'Not allowed', exact: true })).toContainText('Set entitlements');
  await expect(page.getByRole('region', { name: 'Not allowed', exact: true })).toContainText('Bind sources');
  await expect(page.getByRole('region', { name: 'Not allowed', exact: true })).toContainText('Map terms');
  await page.getByRole('button', { name: /Joseph Mensah/ }).click();
  await expect(page.getByRole('region', { name: 'Allowed · Inherited from Harbor Re' })).toContainText('Set entitlements');
  await page.getByRole('button', { name: /Dara Okafor/ }).click();
  await expect(page.getByText('Removing the project grant would not remove company access.', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Allowed · Direct project grant' })).toContainText('Set entitlements');
  await page.getByText('SpiceDB trace', { exact: true }).click();
  await expect(page.getByText('No additional trace detail returned.').first()).toBeVisible();
  expect(state.explanations).toEqual(ids);
  await page.getByLabel('Show', { exact: true }).selectOption('project');
  await expect(page.getByRole('button', { name: /Rita Kowalski/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dara Okafor/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Joseph Mensah/ })).toHaveCount(0);
  await page.getByLabel('Show', { exact: true }).selectOption('company');
  await expect(page.getByRole('button', { name: /Joseph Mensah/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dara Okafor/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Rita Kowalski/ })).toHaveCount(0);
});

test('E-015: switcher contains exactly the returned projects and changing project clears the selected person', async ({ page }) => {
  const state = await api(page);
  await page.goto(`/projects/${projectId}/access`);
  await page.getByRole('button', { name: /Rita Kowalski/ }).click();
  await expect(page.getByRole('region', { name: 'Not allowed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch project: Treaty Book' }).click();
  await expect(page.locator('.pmitem b')).toHaveText(state.projects.map((item) => item.name));
  await page.keyboard.press('Escape');
  await page.getByLabel('Project', { exact: true }).selectOption(nextProjectId);
  await expect(page).toHaveURL(`/projects/${nextProjectId}/access`);
  await expect(page.locator('.crumbs')).toHaveText('Harbor Re/Claims Review/Access');
  await expect(page.getByText('No members found', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Permissions for Rita Kowalski' })).toHaveCount(0);
});

test('member and permission errors keep the server message and offer retry; empty states name a next action', async ({ page }) => {
  const state = await api(page); state.listError = true;
  await page.goto(`/projects/${projectId}/access`);
  await expect(page.getByText('Members are temporarily unavailable.')).toBeVisible();
  state.listError = false;
  await page.getByRole('main').getByRole('button', { name: 'Try again' }).click();
  state.explainError = true;
  await page.getByRole('button', { name: /Joseph Mensah/ }).click();
  await expect(page.getByText('Permissions are temporarily unavailable.')).toBeVisible();
  state.explainError = false; state.emptyPermissions = true;
  await page.getByRole('main').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No permission results', { exact: true })).toBeVisible();
  state.emptyPermissions = false;
  await page.getByRole('button', { name: 'Refresh permissions' }).click();
  await expect(page.getByRole('region', { name: 'Allowed · Inherited from Harbor Re' })).toBeVisible();
  state.empty = true;
  await page.reload();
  await expect(page.getByText('No members found', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh members' })).toBeVisible();
});

test('member list and selected explanation each show loading', async ({ page }) => {
  await api(page);
  for (const endpoint of ['**/members', '**/explain']) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(endpoint, async (route) => { await gate; await route.fallback(); });
    try {
      await page.goto(`/projects/${projectId}/access`);
      if (endpoint.endsWith('explain')) await page.getByRole('button', { name: /Joseph Mensah/ }).click();
      await expect(page.getByRole('main').getByText('Preparing this view', { exact: true })).toBeVisible();
    } finally { release(); }
    await expect(page.getByRole('main').getByText('Preparing this view', { exact: true })).toHaveCount(0);
    await page.unroute(endpoint);
  }
});
