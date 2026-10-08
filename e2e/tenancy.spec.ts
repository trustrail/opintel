import {test} from './fixtures.js';
import { expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import { CreateCompanyBody, CreateProjectBody } from '../src/shared/api/tenancy-schemas.js';

test.use({ launchOptions: { args: ['--disable-gpu'] } });

const companyId = '018f8f9d-7f83-7abc-8def-000000000001';
const industryId = '018f8f9d-7f83-7abc-8def-000000000002';
const projectId = '018f8f9d-7f83-7abc-8def-000000000003';
const nextId = '018f8f9d-7f83-7abc-8def-000000000004';
const user = { id: '018f8f9d-7f83-7abc-8def-000000000005', email: 'owner@example.com', fullName: 'Owner', timezone: 'UTC', method: 'magic_link', sessionCreatedAt: '2026-01-01T00:00:00.000Z', deviceConfirmed: true };
const industry = { id: industryId, slug: 'reinsurance', name: 'Reinsurance Treaty', description: 'Treaty, cedant and bordereaux terms for reinsurance.', inheritedTermCount: 42, hasDemoPack: true };
const initialProject = { id: projectId, name: 'Treaty Book', region: 'eu-west-1', role: 'admin', company: { id: companyId, name: 'Harbor Re' }, industry: { id: industryId, name: industry.name } };

async function api(page: Page, options: { empty?: boolean; noAdmin?: boolean; failCreate?: boolean; failRead?: boolean; noIndustries?: boolean } = {}) {
  const projects = options.empty ? [] : [initialProject];
  const companies = options.noAdmin ? [] : [{ id: companyId, name: 'Harbor Re', role: 'admin', projectCount: projects.length }];
  const state = { failCreate: options.failCreate ?? false, failRead: options.failRead ?? false, projectPosts: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) { await route.fulfill({ json: user }); return; }
    if (state.failRead && request.method() === 'GET') { await route.fulfill({ status: 503, json: { error: { code: 'dependency_unavailable', message: 'Options are temporarily unavailable.', requestId: 'test-read', retryable: true } } }); return; }
    if (request.method() === 'POST') {
      if (path.endsWith('/projects')) state.projectPosts += 1;
      if (state.failCreate) { await route.fulfill({ status: 409, json: { error: { code: 'conflict', message: 'A project with this name already exists in the company.', requestId: 'test-create', retryable: false } } }); return; }
      if (path.endsWith('/projects')) {
        const body = CreateProjectBody.parse(request.postDataJSON());
        projects.push({ ...initialProject, id: nextId, name: body.name, region: body.region });
        await route.fulfill({ status: 201, json: { id: nextId, ...body, industry: { id: industryId, name: industry.name, inheritedTermCount: 42 }, createdAt: '2026-01-02T00:00:00.000Z' } }); return;
      }
      const body = CreateCompanyBody.parse(request.postDataJSON());
      companies.push({ id: companyId, name: body.name, role: 'admin', projectCount: 0 });
      await route.fulfill({ status: 201, json: { id: companyId, ...body, createdAt: '2026-01-02T00:00:00.000Z' } }); return;
    }
    if(path.endsWith('/stats')) { await route.fulfill({json:{asOf:'2026-09-29T00:00:00.000Z',utcDay:'2026-09-29',pools:0,sources:0,spectrum:{clear:0,tokenized:0,masked:0,aggregate_only:0,withheld:0,undecided:0},requests:0,queries:0,prompts:0,refused:0,incomplete:0,connectedAgents:0,staleAgents:0}}); return; }
    if(path.includes('/dashboard/')) { await route.fulfill({json:{items:[],nextCursor:null}}); return; }
    if(path.endsWith('/pools')||path.endsWith('/runs')) { await route.fulfill({json:{items:[],nextCursor:null}}); return; }
    if(path.endsWith('/observations')||path.endsWith('/custody-observations')) { await route.fulfill({json:{items:[],nextCursor:null,counts:{open:0,resolved:0}}}); return; }
    if(path.endsWith('/suggestions')) { const id=path.split('/')[4];await route.fulfill({json:{items:[],nextCursor:null,projectName:projects.find(p=>p.id===id)?.name??'Treaty Book'}}); return; }
    if(path.endsWith('/runs/summary')) { await route.fulfill({json:{counts:{all:0,refused:0,incomplete:0,answerTreated:0},days:[]}}); return; }
    if(path.endsWith('/token-key')) { await route.fulfill({json:{currentVersion:null,versions:[]}}); return; }
    if (path.endsWith('/projects')) await route.fulfill({ json: { items: projects, nextCursor: null } });
    else if (path.endsWith('/companies')) await route.fulfill({ json: { items: companies, nextCursor: null } });
    else if (path.endsWith('/industries')) await route.fulfill({ json: options.noIndustries ? [] : [industry, { ...industry, id: nextId, name: 'General', slug: 'general', description: 'Start without an inherited vocabulary.', inheritedTermCount: 0, hasDemoPack: false }] });
    else await route.fulfill({ status: 404, json: {} });
  });
  return state;
}

for (const [path, title, slug] of [['/projects', 'Your projects', 'chooser'], ['/projects/new', 'Create project', 'create-project'], ['/companies/new', 'Create company', 'create-company']] as const) {
  for (const width of [390, 900, 1440]) {
    test(`E2-022: ${slug} keyboard, axe and snapshot at ${width}`, { tag: '@visual' }, async ({ page }) => {
      await api(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      if (slug === 'chooser') await expect(page.getByRole('link', { name: 'Treaty Book', exact: true })).toBeVisible();
      else {
        const field = page.getByRole('textbox', { name: slug === 'create-project' ? 'Project name' : 'Company name' });
        await field.focus();
        await page.keyboard.type('Keyboard entry');
        await expect(field).toHaveValue('Keyboard entry');
        await page.keyboard.press('Tab');
        await expect(field).not.toBeFocused();
        await field.fill('');
      }
      await page.getByRole('heading', { name: title, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await expect(page).toHaveScreenshot(`${slug}-${width}.png`, { animations: 'disabled', fullPage: true });
      await page.addScriptTag({ content: axe.source });
      expect(await page.evaluate(async () => (await axe.run()).violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => ({ target: node.target, message: node.failureSummary })) })))).toEqual([]);
      if (slug === 'chooser') {
        await page.getByRole('link', { name: 'Treaty Book', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(`/projects/${projectId}/dashboard`);
      }
    });
  }
}

test('E2-019, E2-020: retains failed project form, then lands on the new dashboard with live switcher and breadcrumb', async ({ page }) => {
  const state = await api(page, { failCreate: true });
  await page.goto('/projects/new');
  await page.getByLabel('Project name', { exact: true }).fill('New Treaty');
  await page.getByLabel('Region', { exact: true }).selectOption('us-east-1');
  await page.getByRole('radio', { name: /Reinsurance Treaty/ }).check();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('A project with this name already exists');
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('New Treaty');
  await expect(page.getByLabel('Region', { exact: true })).toHaveValue('us-east-1');
  await expect(page.getByRole('radio', { name: /Reinsurance Treaty/ })).toBeChecked();
  state.failCreate = false;
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page).toHaveURL(`/projects/${nextId}/dashboard`);
  await expect(page.getByRole('heading', { name: 'New Treaty' })).toBeVisible();
  await expect(page.locator('.setup .stepcard')).toHaveCount(3);
  await expect(page.locator('.crumbs')).toHaveText('Harbor Re/New Treaty/Dashboard');
  await page.getByRole('button', { name: 'Switch project: New Treaty' }).click();
  await page.locator('.pmitem').filter({ hasText: 'Treaty Book' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/dashboard`);
  await expect(page.locator('.crumbs')).toHaveText('Harbor Re/Treaty Book/Dashboard');
  expect(state.projectPosts).toBe(2);
});

test('new users land on the chooser, create a company first, then create a project', async ({ page }) => {
  await api(page, { empty: true, noAdmin: true });
  await page.goto('/');
  await expect(page).toHaveURL('/projects');
  await expect(page.getByRole('main').getByText('No projects yet', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Create company', exact: true }).click();
  await page.getByLabel('Company name').fill('Harbor Re');
  await page.getByLabel('Region', { exact: true }).selectOption('eu-west-1');
  await page.getByRole('button', { name: 'Create company', exact: true }).click();
  await expect(page).toHaveURL('/projects/new');
  await expect(page.getByLabel('Region', { exact: true })).toHaveValue('eu-west-1');
  await expect(page.getByText('Company:', { exact: false })).toBeVisible();
});

test('all screens show server read errors and can retry', async ({ page }) => {
  const state = await api(page, { failRead: true });
  for (const path of ['/projects', '/projects/new', '/companies/new']) {
    await page.goto(path);
    await expect(page.getByRole('main').getByText('Options are temporarily unavailable.', { exact: true })).toBeVisible();
  }
  state.failRead = false;
  await page.getByRole('main').getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByLabel('Company name')).toBeVisible();
});

test('purposeful empty project and company creation states', async ({ page }) => {
  await api(page, { noIndustries: true });
  await page.goto('/projects/new');
  await expect(page.getByText('No industries available', { exact: true })).toBeVisible();
  await page.goto('/companies/new');
  await expect(page.getByText('No industry packs are available yet.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Company name')).toBeVisible();
});

test('E2-019: company creation failure preserves all choices', async ({ page }) => {
  await api(page, { failCreate: true });
  await page.goto('/companies/new');
  await page.getByLabel('Company name').fill('New Company');
  await page.getByLabel('Region', { exact: true }).selectOption('ap-southeast-1');
  await page.getByRole('radio', { name: /Reinsurance Treaty/ }).check();
  await page.getByRole('button', { name: 'Create company', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Company name')).toHaveValue('New Company');
  await expect(page.getByLabel('Region', { exact: true })).toHaveValue('ap-southeast-1');
  await expect(page.getByRole('radio', { name: /Reinsurance Treaty/ })).toBeChecked();
});

test('each screen presents a loading state while its data is pending', async ({ page }) => {
  await api(page);
  for (const path of ['/projects', '/projects/new', '/companies/new']) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const endpoint = path === '/projects' ? '**/api/v1/projects' : '**/api/v1/industries';
    await page.route(endpoint, async (route) => { await gate; await route.fallback(); });
    try {
      await page.goto(path);
      await expect(page.getByRole('main').getByText('Preparing this view', { exact: true })).toBeVisible();
    } finally { release(); }
    await expect(page.getByRole('main').getByText('Preparing this view', { exact: true })).toHaveCount(0);
    await page.unroute(endpoint);
  }
});

test('company creation keeps its Idempotency-Key on a retry and changes it for a new command',async({page})=>{
 await api(page);await page.goto('/companies/new');await page.getByLabel('Company name').fill('Retry company');await page.getByLabel('Region',{exact:true}).selectOption('eu-west-1');
 const keys:string[]=[];
 await page.route('**/api/v1/companies',async route=>{if(route.request().method()!=='POST')return route.fallback();keys.push(route.request().headers()['idempotency-key']??'');await route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'The company was saved, but administrator access could not be confirmed.',requestId:'retry',retryable:true}}});});
 const create=page.getByRole('button',{name:'Create company',exact:true});
 await create.click();await expect(page.getByRole('alert')).toContainText('administrator access');await expect(create).toBeEnabled();
 await create.click();await expect.poll(()=>keys.length).toBe(2);await expect(create).toBeEnabled();expect(keys[0]).not.toBe('');expect(keys[1]).toBe(keys[0]);
 await page.getByLabel('Company name').fill('Different company');await create.click();await expect.poll(()=>keys.length).toBe(3);expect(keys[2]).not.toBe(keys[0]);
});
