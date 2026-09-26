import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {mock,project,expand,pool} from './entitlements-fixture.js';
test.use({reducedMotion:'reduce'});
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
for(const width of [390,900,1440])test(`Entitlements tree and bulk bar at ${width}`,{tag:'@visual'},async({page})=>{
 await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/entitlements`);await expand(page);await page.evaluate(()=>document.fonts.ready);await page.getByLabel('Select field_0000',{exact:true}).check();await page.getByLabel('Treatment',{exact:true}).selectOption('clear');await page.getByLabel('Justification (required)').fill('Approved for reporting');await page.evaluate(()=>window.scrollTo(0,0));
 await expect(page).toHaveScreenshot(`entitlements-${width}.png`,{fullPage:true});await accessible(page);
});
test('H-009 UI: no reset or undecided treatment; clear needs justification and saves selected decisions',async({page})=>{
 const state=await mock(page);await page.goto(`/projects/${project}/entitlements`);await expand(page);
 await expect(page.getByText('Undecided',{exact:true})).toHaveCount(2);await expect(page.getByRole('button',{name:/reset/i})).toHaveCount(0);
 await page.getByLabel('Select field_0000',{exact:true}).check();const selector=page.getByLabel('Treatment',{exact:true});expect(await selector.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value))).toEqual(['clear','tokenized','masked','aggregate_only','withheld']);
 await selector.selectOption('clear');const apply=page.getByRole('button',{name:'Apply to selection',exact:true});await expect(apply).toBeDisabled();await page.getByLabel('Justification (required)').fill('   ');await expect(apply).toBeDisabled();await page.getByLabel('Justification (required)').fill('Reporting review');await apply.click();await expect(page.getByRole('status').filter({hasText:'entitlement decisions saved.'})).toHaveText('1 entitlement decisions saved.');expect(state.commands[0]?.body).toMatchObject({treatment:'clear',justification:'Reporting review',projectId:project});expect(state.commands[0]?.key).toBeTruthy();
 await expect(page.getByRole('treeitem').filter({hasText:'field_0000'})).toContainText('In the clear');
 await page.getByRole('button',{name:'View DDL',exact:true}).click();await expect(page.locator('pre.code')).toContainText('CREATE VIEW');await accessible(page);
});
test('bulk errors retain selection and idempotency key, expose every invalid reason, and Cancel only clears selection',async({page})=>{
 const state=await mock(page);state.failBulk=true;await page.goto(`/projects/${project}/entitlements`);await expand(page);await page.getByLabel('Select field_0000',{exact:true}).check();const apply=page.getByRole('button',{name:'Apply to selection',exact:true});await apply.click();await expect(page.getByRole('alert')).toContainText('Decisions could not be saved. Try again.');await apply.click();await expect.poll(()=>state.commands.length).toBe(2);expect(state.commands[0]?.key).toBe(state.commands[1]?.key);
 state.failBulk=false;state.invalid=true;await page.getByLabel('Treatment',{exact:true}).selectOption('tokenized');await apply.click();await expect(page.getByRole('alert')).toContainText('A token domain is missing.');expect(state.commands[2]?.key).not.toBe(state.commands[1]?.key);await expect(page.getByLabel('Select field_0000',{exact:true})).toBeChecked();await page.getByRole('button',{name:'Cancel selection'}).click();expect(state.decisions.size).toBe(0);await expect(page.getByLabel('Select field_0000',{exact:true})).not.toBeChecked();
});
test('pool and filter navigation clears selections; loading, empty and error are purposeful',async({page})=>{
 const state=await mock(page);state.loading=true;await page.goto(`/projects/${project}/entitlements`);await expect(page.getByText('Preparing this view',{exact:true})).toBeVisible();await expand(page);state.loading=false;await page.getByLabel('Select field_0000',{exact:true}).check();await page.getByLabel('Pool',{exact:true}).selectOption({label:'Other pool'});await expect(page.getByLabel('Treatment',{exact:true})).toHaveCount(0);await page.goBack();await expect(page.getByLabel('Pool',{exact:true})).toHaveValue(pool);
 state.error=true;await page.reload();await expect(page.getByText('Decisions are temporarily unavailable. Try again.',{exact:true})).toBeVisible();state.error=false;state.empty=true;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('No catalogue yet',{exact:true})).toBeVisible();await accessible(page);
});
test('viewer can inspect chips but cannot select, apply or view admin DDL',async({page})=>{const state=await mock(page);state.viewer=true;await page.goto(`/projects/${project}/entitlements`);await expand(page);await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'View DDL',exact:true})).toHaveCount(0);await expect(page.getByText('Undecided',{exact:true})).toHaveCount(2);});
