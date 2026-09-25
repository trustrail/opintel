import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
const id='018f8f9d-7f83-7abc-8def-000000000001', companyId='018f8f9d-7f83-7abc-8def-000000000002',other='018f8f9d-7f83-7abc-8def-000000000003';
async function setup(page:Page){
 await page.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00Z',deviceConfirmed:true}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id,name:'Reporting',company:{id:companyId,name:'Example Company'},industry:{id:companyId,name:'General'},region:'eu-west-1',role:'admin'},{id:other,name:'Other project',company:{id:other,name:'Other company'},industry:{id:companyId,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
  if(path.endsWith('/companies'))return route.fulfill({json:{items:[{id:companyId,name:'Example Company',role:'admin',projectCount:1},{id:other,name:'Other company',role:'admin',projectCount:1}],nextCursor:null}});
  if(path.endsWith('/token-key'))return route.fulfill({json:{currentVersion:null,versions:[]}});
  return route.fulfill({json:{items:[],nextCursor:null}});
 });
}
test('drawer destinations, keyboard order, collapsed state and scoped breadcrumbs',async({page})=>{
 await setup(page);await page.setViewportSize({width:1440,height:1000});await page.goto(`/projects/${id}/access`);
 const nav=page.getByRole('navigation',{name:'Primary navigation'}),crumb=page.getByRole('navigation',{name:'Breadcrumb'});
 const access=nav.getByRole('button',{name:'Access',exact:true});

 await expect(nav.getByRole('button',{name:'Hide sub-items of Access'})).toHaveAttribute('aria-expanded','true');await expect(access).toHaveAttribute('aria-current','page');
 await expect(page.locator('main').getByRole('link',{name:'Manage token key'})).toHaveCount(0);
 await access.focus();await page.keyboard.press('Tab');await expect(nav.getByRole('button',{name:'Hide sub-items of Access'})).toBeFocused();await page.keyboard.press('Tab');await expect(nav.getByRole('link',{name:'Token key'})).toBeFocused();await page.keyboard.press('Enter');
 await expect(nav.getByRole('link',{name:'Token key'})).toHaveAttribute('aria-current','page');await expect(access).toHaveAttribute('data-active','true');await expect(access).not.toHaveAttribute('aria-current','page');
 await expect(crumb.locator('ol > li')).toHaveCount(4);await expect(crumb.locator('[aria-current="page"]')).toHaveText('Token key');await expect(crumb.locator('[aria-current="page"]')).not.toHaveJSProperty('tagName','A');
 await crumb.getByRole('link',{name:'Access',exact:true}).click();await expect(page).toHaveURL(`/projects/${id}/access`);
 await nav.getByRole('button',{name:'Data sources',exact:true}).click();await expect(nav.getByRole('link',{name:'Token key'})).toBeHidden();
 const sources=nav.getByRole('button',{name:'Data sources',exact:true});await expect(nav.getByRole('button',{name:'Hide sub-items of Data sources'})).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('main').getByRole('link',{name:'Explore schema'})).toHaveCount(0);
 await sources.focus();await page.keyboard.press('Tab');await expect(nav.getByRole('button',{name:'Hide sub-items of Data sources'})).toBeFocused();await page.keyboard.press('Tab');await expect(nav.getByRole('link',{name:'Explore schema'})).toBeFocused();await page.keyboard.press('Enter');
 await expect(nav.getByRole('link',{name:'Explore schema'})).toHaveAttribute('aria-current','page');await expect(crumb.locator('[aria-current="page"]')).toHaveText('Explore schema');
 await page.getByRole('button',{name:'Collapse menu'}).click();await expect(nav.getByRole('link',{name:'Explore schema'})).toBeHidden();await expect(nav.locator('button[data-disclosure]')).toHaveCount(0);
 await page.getByRole('button',{name:'Expand menu'}).click();await expect(nav.getByRole('link',{name:'Explore schema'})).toBeVisible();
 await crumb.getByRole('link',{name:'Reporting',exact:true}).click();await expect(page).toHaveURL(`/projects/${id}/dashboard`);
 await crumb.getByRole('link',{name:'Example Company'}).click();await expect(page).toHaveURL(`/projects?companyId=${companyId}`);await expect(page.getByLabel('Company',{exact:true})).toHaveValue(companyId);
 await expect(page.locator('main').getByRole('link',{name:'Reporting',exact:true})).toBeVisible();await expect(page.locator('main').getByRole('link',{name:'Other project',exact:true})).toHaveCount(0);
 await page.getByLabel('Company',{exact:true}).selectOption('');await expect(page.locator('main').getByRole('link',{name:'Other project',exact:true})).toBeVisible();await page.goBack();await expect(page.getByLabel('Company',{exact:true})).toHaveValue(companyId);
});
test('390px breadcrumb exposes only its parent back link and no drawer sub-items',async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:1000});await page.goto(`/projects/${id}/token-key`);
 const crumb=page.getByRole('navigation',{name:'Breadcrumb'}), nav=page.getByRole('navigation',{name:'Primary navigation'});
 expect(await crumb.locator('li').nth(2).evaluate(el=>getComputedStyle(el,'::before').content)).toBe('"‹"');
 await expect(crumb.getByRole('link')).toHaveCount(1);await expect(crumb.getByRole('link',{name:'Access'})).toBeVisible();await expect(nav.getByRole('link',{name:'Token key'})).toBeHidden();await expect(nav.locator('button[data-disclosure]')).toHaveCount(0);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
 await crumb.getByRole('link',{name:'Access'}).click();await expect(page).toHaveURL(`/projects/${id}/access`);await expect(crumb.getByRole('link',{name:'Reporting'})).toBeVisible();
});

for(const screen of ['catalog','token-key','access','data-sources','dashboard','observations','activity','releases','workbench','vocabulary','source-of-truth','relationships','knowledge','entitlements','pools','audit-log','settings']){
 test(`screens have no ad-hoc back links or buttons outside Breadcrumb: ${screen}`,async({page})=>{
  await setup(page);await page.goto(`/projects/${id}/${screen}`);await expect(page.locator('main h1')).toBeVisible();
  const outside=page.locator(':not(nav[aria-label="Breadcrumb"] *)'),name=/^(back|back to |. back)/i;
  await expect(page.getByRole('link',{name}).and(outside)).toHaveCount(0);
  await expect(page.getByRole('button',{name}).and(outside)).toHaveCount(0);
  if(screen==='catalog')await expect(page.locator('main').getByRole('link',{name:'Data sources',exact:true})).toHaveCount(0);
 });
}

test('disclosure toggles independently, retains overrides, and uses one icon and colour',async({page})=>{
 await setup(page);await page.setViewportSize({width:1440,height:1000});await page.goto(`/projects/${id}/access`);
 const nav=page.getByRole('navigation',{name:'Primary navigation'});
 const access=nav.locator('button[data-disclosure][aria-controls="nav-access"]');
 const sources=nav.locator('button[data-disclosure][aria-controls="nav-data-sources"]');
 await expect(access).toHaveAccessibleName('Hide sub-items of Access');await expect(sources).toHaveAccessibleName('Show sub-items of Data sources');
 const icon=access.locator('span');await expect(icon).toHaveText('›');await expect(icon).toHaveAttribute('aria-hidden','true');
 await expect(icon).toHaveCSS('transform','matrix(0, 1, -1, 0, 0, 0)');
 const colour=await icon.evaluate(el=>getComputedStyle(el).color);await expect(sources.locator('span')).toHaveCSS('color',colour);
 await access.click();await expect(page).toHaveURL(`/projects/${id}/access`);await expect(access).toHaveAccessibleName('Show sub-items of Access');await expect(nav.getByRole('link',{name:'Token key'})).toBeHidden();await expect(icon).toHaveCSS('color',colour);await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
 await sources.focus();await page.keyboard.press('Enter');await expect(sources).toHaveAccessibleName('Hide sub-items of Data sources');await expect(page).toHaveURL(`/projects/${id}/access`);await expect(nav.getByRole('link',{name:'Explore schema'})).toBeVisible();
 await page.keyboard.press('Space');await expect(sources).toHaveAccessibleName('Show sub-items of Data sources');await expect(page).toHaveURL(`/projects/${id}/access`);
 await nav.getByRole('button',{name:'Data sources',exact:true}).click();await expect(page).toHaveURL(`/projects/${id}/data-sources`);await expect(nav.getByRole('link',{name:'Explore schema'})).toBeHidden();
 await nav.getByRole('button',{name:'Access',exact:true}).click();await expect(nav.getByRole('link',{name:'Token key'})).toBeHidden();
 await access.focus();await page.keyboard.press('Space');await expect(nav.getByRole('link',{name:'Token key'})).toBeVisible();await page.keyboard.press('Enter');await expect(nav.getByRole('link',{name:'Token key'})).toBeHidden();
 expect(await access.evaluate(el=>el.parentElement?.querySelectorAll(':scope > button').length)).toBe(2);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
});

test('drawer row shares hover, focus-within and active background, with control-local focus rings',async({page})=>{
 await setup(page);await page.setViewportSize({width:1440,height:1000});await page.goto(`/projects/${id}/dashboard`);
 const nav=page.getByRole('navigation',{name:'Primary navigation'}),label=nav.getByRole('button',{name:'Data sources',exact:true});
 const toggle=nav.getByRole('button',{name:'Show sub-items of Data sources'}),row=label.locator('..');
 const normal=await row.evaluate(el=>getComputedStyle(el).backgroundColor);
 const highlight=await row.evaluate(el=>{const probe=document.createElement('span');probe.style.background='var(--plum-2)';el.append(probe);const colour=getComputedStyle(probe).backgroundColor;probe.remove();return colour;});
 for(const control of [label,toggle]){
  await control.hover();await expect(row).toHaveCSS('background-color',highlight);
  await expect(label).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(toggle).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await page.getByRole('heading',{name:'Reporting',exact:true}).hover();await expect(row).toHaveCSS('background-color',normal);
 }
 await label.focus();await page.keyboard.press('Tab');await expect(toggle).toBeFocused();
 await expect(row).toHaveCSS('background-color',highlight);await expect(toggle).toHaveCSS('outline-style','solid');await expect(label).toHaveCSS('outline-style','none');await expect(row).toHaveCSS('outline-style','none');
 await page.keyboard.press('Shift+Tab');await expect(label).toBeFocused();await expect(label).toHaveCSS('outline-style','solid');await expect(toggle).toHaveCSS('outline-style','none');
 await nav.getByRole('button',{name:'Dashboard',exact:true}).focus();await expect(row).toHaveCSS('background-color',normal);
 await label.click();await expect(page).toHaveURL(`/projects/${id}/data-sources`);await page.getByRole('heading',{name:'Data sources',exact:true}).hover();await nav.getByRole('button',{name:'Dashboard',exact:true}).focus();
 await expect(row).toHaveCSS('background-color',highlight);await expect(row).toHaveAttribute('data-active','true');
 await nav.getByRole('button',{name:'Hide sub-items of Data sources'}).click();await expect(page).toHaveURL(`/projects/${id}/data-sources`);await expect(row).toHaveCSS('background-color',highlight);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
});
