import {capture} from './capture.js';
import {ProjectId,ElementId} from '../src/shared/kernel/value-objects.js';
import {derivedTokenDomain} from '../src/shared/token-domain.js';
import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {mock,project,expand,pool,source} from './entitlements-fixture.js';
test.use({reducedMotion:'reduce'});
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
for(const width of [390,900,1440])test(`Entitlements tree and bulk bar at ${width}`,{tag:'@visual'},async({page})=>{
 await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/entitlements`);await expand(page);await page.evaluate(()=>document.fonts.ready);await page.getByLabel('Select field_0000',{exact:true}).check();await page.getByLabel('Treatment',{exact:true}).selectOption('clear');await page.getByLabel('Justification (required)').fill('Approved for reporting');await page.evaluate(()=>window.scrollTo(0,0));
 await capture(page,test.info(),`entitlements-${width}.png`,{fullPage:true});await accessible(page);
});
test('H-009 UI: no reset or undecided treatment; clear needs justification and saves selected decisions',async({page})=>{
 const state=await mock(page);await page.goto(`/projects/${project}/entitlements`);await expand(page);
 await expect(page.getByRole('treeitem').filter({has:page.getByText('field_0000',{exact:true})}).getByRole('img',{name:'Undecided',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/reset/i})).toHaveCount(0);
 await page.getByLabel('Select field_0000',{exact:true}).check();const selector=page.getByLabel('Treatment',{exact:true});expect(await selector.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value))).toEqual(['clear','tokenized','masked','aggregate_only','withheld']);
 await selector.selectOption('clear');const apply=page.getByRole('button',{name:'Apply to selection',exact:true});await expect(apply).toBeDisabled();await page.getByLabel('Justification (required)').fill('   ');await expect(apply).toBeDisabled();await page.getByLabel('Justification (required)').fill('Reporting review');await apply.click();await expect(page.getByRole('status').filter({hasText:'entitlement decisions saved.'})).toHaveText('1 entitlement decisions saved.');expect(state.commands[0]?.body).toMatchObject({treatment:'clear',justification:'Reporting review',projectId:project});expect(state.commands[0]?.key).toBeTruthy();
 await expect(page.getByRole('treeitem').filter({has:page.getByText('field_0000',{exact:true})}).getByRole('img',{name:'In the clear',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'View DDL',exact:true})).toHaveCount(0);await expect(page.locator('pre.code')).toHaveCount(0);expect(state.viewRequests).toBe(0);await accessible(page);
});
test('bulk errors retain selection and idempotency key, expose every invalid reason, and Cancel only clears selection',async({page})=>{
 const state=await mock(page);state.failBulk=true;await page.goto(`/projects/${project}/entitlements`);await expand(page);await page.getByLabel('Select field_0000',{exact:true}).check();const apply=page.getByRole('button',{name:'Apply to selection',exact:true});await apply.click();await expect(page.getByRole('alert')).toContainText('Decisions could not be saved. Try again.');await apply.click();await expect.poll(()=>state.commands.length).toBe(2);expect(state.commands[0]?.key).toBe(state.commands[1]?.key);
 state.failBulk=false;state.invalid=true;await page.getByLabel('Treatment',{exact:true}).selectOption('tokenized');await apply.click();await expect(page.getByRole('alert')).toContainText('A token domain is missing.');expect(state.commands[2]?.key).not.toBe(state.commands[1]?.key);await expect(page.getByLabel('Select field_0000',{exact:true})).toBeChecked();await page.getByRole('button',{name:'Cancel selection'}).click();expect(state.decisions.size).toBe(0);await expect(page.getByLabel('Select field_0000',{exact:true})).not.toBeChecked();
});
test('pool and filter navigation clears selections; loading, empty and error are purposeful',async({page})=>{
 const state=await mock(page);state.loading=true;await page.goto(`/projects/${project}/entitlements`);await expect(page.getByText('Preparing this view',{exact:true})).toBeVisible();await expand(page);state.loading=false;await page.getByLabel('Select field_0000',{exact:true}).check();await page.getByLabel('Pool',{exact:true}).selectOption({label:'Other pool'});await expect(page.getByLabel('Treatment',{exact:true})).toHaveCount(0);await page.goBack();await expect(page.getByLabel('Pool',{exact:true})).toHaveValue(pool);
 state.error=true;await page.reload();await expect(page.getByText('Decisions are temporarily unavailable. Try again.',{exact:true})).toBeVisible();state.error=false;state.empty=true;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('No catalogue yet',{exact:true})).toBeVisible();await accessible(page);
});
test('viewer can inspect chips but cannot select, apply or view admin DDL',async({page})=>{const state=await mock(page);state.viewer=true;await page.goto(`/projects/${project}/entitlements`);await expand(page);await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'View DDL',exact:true})).toHaveCount(0);await expect(page.getByRole('treeitem').filter({has:page.getByText('field_0000',{exact:true})}).getByRole('img',{name:'Undecided',exact:true})).toBeVisible();});

for(const width of [390,900,1440])test(`Money locale and unsupported diagnosis at ${width}`,{tag:'@visual'},async({page})=>{
 const state=await mock(page);state.money=true;
 await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/entitlements`);await expand(page);
 await expect(page.getByText(/fractional digits depend on the source server/)).toBeVisible();
 await expect(page.getByLabel('Select field_0006',{exact:true})).toBeDisabled();
 await expect(page.getByText('Unmapped type',{exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>window.scrollTo(0,0));await capture(page,test.info(),`money-type-diagnostics-${width}.png`,{fullPage:true});await accessible(page);
});

test('DECL-007: qualified validation error links to declarations without requiring a loaded explorer branch',async({page})=>{
 const state=await mock(page);state.invalid=true;await page.goto(`/projects/${project}/entitlements`);await expand(page);
 await page.getByLabel('Select field_0000',{exact:true}).check();await page.getByLabel('Treatment',{exact:true}).selectOption('tokenized');await page.getByRole('button',{name:/Apply to/}).click();
 const error=page.getByRole('alert');await expect(error).toContainText('warehouse.public.records.field_0000');await expect(error).toContainText('Data sources → Explore schema');await expect(error).not.toContainText('018f8f9d-7f83-7abc-8def-000000000100');
 await page.route('**/catalog/elements/*/declarations',route=>route.fulfill({json:{elementId:'018f8f9d-7f83-7abc-8def-000000000100',sourceId:source,schemaName:'public',qualifiedName:'warehouse.public.records.field_0000',exposedType:'VARCHAR',projectName:'Reporting',stored:{tokenDomain:null,caseInsensitive:null,sourceTimezone:null,epochUnit:null,canonId:null},schemaTimezone:null,effective:{tokenDomain:derivedTokenDomain({projectId:ProjectId(project),elementId:ElementId('018f8f9d-7f83-7abc-8def-000000000100')}),caseInsensitive:true,sourceTimezone:null,epochUnit:null,canonId:'stdtext1',mode:'text'},tokenizedEntitlements:0,canonicalisers:['stdtext1'],discoveryError:null}}));
 await page.getByRole('link',{name:'Open declarations',exact:true}).click();await expect(page.getByRole('heading',{name:'Token declarations',exact:true})).toBeVisible();await expect(page.getByLabel('Token domain',{exact:true})).toHaveValue('');await expect(page).toHaveURL(/elementId=018f8f9d-7f83-7abc-8def-000000000100/);
});

for(const width of [390,900,1440])test('RED-008: tree identity labels and compact summary at '+width,async({page})=>{
 await mock(page);await page.setViewportSize({width,height:1000});await page.goto('/projects/'+project+'/entitlements');await expand(page);
 const tree=page.getByRole('tree',{name:'Entitlements'});
 const labels=tree.locator('[data-part=identity] > b');await expect(labels.first()).toBeVisible();
 for(const label of await labels.all()){await expect(label).toHaveCSS('font-size','13.5px');await expect(label).toHaveCSS('font-weight',await label.evaluate(el=>el.closest('[data-row]')?.getAttribute('data-row')==='entitlement-member'?'560':'650'));}
 const summary=page.getByRole('region',{name:'Decision distribution'});await expect(summary.locator('.bar')).toHaveCount(1);await expect(summary.locator('.speclegend > div')).toHaveCount(6);
 await expect(summary.getByText('7 members',{exact:true})).toBeVisible();await expect(summary.locator('h1,h2,h3,p,footer')).toHaveCount(0);
 await expect(summary.locator('..')).toContainText('Entitlements');
 await accessible(page);
});
test('RED-005: one name filter scopes columns across all tables',async({page})=>{
 await mock(page);await page.goto('/projects/'+project+'/entitlements');await expand(page);
 await expect(page.getByLabel('Column name starts with (all tables)',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Browse branch',{exact:true})).toHaveCount(0);
 const request=page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/entitlements')&&new URL(r.url()).searchParams.get('elementPrefix')==='field_0001');
 await page.getByLabel('Column name starts with (all tables)',{exact:true}).fill('field_0001');await request;
 await expect(page.getByRole('treeitem').filter({hasText:'field_0001'})).toBeVisible();await expect(page.getByRole('treeitem').filter({hasText:'field_0000'})).toHaveCount(0);
});
