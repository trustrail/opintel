import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {fixture} from './settings-fixture.js';
import {project} from './dashboard-fixture.js';
async function edit(page:Page,label:string){await page.getByRole('button',{name:'Edit '+label,exact:true}).click();}
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=> (await axe.run()).violations.map(v=>v.id))).toEqual([]);}

test('SET-001: one cross-tab draft saves once, preserves absent limits, and discards',async({page})=>{
 const {state}=await fixture(page);await page.goto(`/projects/${project}/settings`);
 await edit(page,'Query timeout (seconds)');await page.getByLabel('Query timeout (seconds)',{exact:true}).fill('45');
 await page.getByRole('tab',{name:'Discovery',exact:true}).click();await edit(page,'Detected renames');await page.getByLabel('Detected renames',{exact:true}).selectOption('new');
 await page.getByRole('tab',{name:'Evidence',exact:true}).click();await edit(page,'Argument redaction');await page.getByLabel('Argument redaction',{exact:true}).selectOption('allowlist');
 await page.getByRole('tab',{name:'Agents and keys',exact:true}).click();await edit(page,'Agent heartbeat interval (seconds)');await page.getByLabel('Agent heartbeat interval (seconds)',{exact:true}).fill('25');
 await page.getByRole('tab',{name:'Engines',exact:true}).click();await expect(page.getByText('No engines registered',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Query',exact:true}).click();await expect(page.getByLabel('Query timeout (seconds)',{exact:true})).toHaveValue('45');
 await expect(page.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(1);await expect(page.locator('.bulkbar')).toContainText('4 changed');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);
 expect(state.writes[0]).toEqual({query:{timeoutSeconds:45},discovery:{newElements:'rules_only',typeFamilyChange:'revert',renameHandling:'new',adoptRenamedNames:false,valueSampling:false},evidence:{redaction:'allowlist'},agentHeartbeatSeconds:25});
 await expect(page.locator('.screen').getByRole('status')).toHaveText('Settings saved.');await page.getByLabel('Query timeout (seconds)',{exact:true}).fill('60');await page.getByRole('button',{name:'Discard',exact:true}).click();await expect(page.getByLabel('Query timeout (seconds)',{exact:true})).toHaveValue('45');await expect(page.locator('.bulkbar')).toHaveCount(0);
});

test('SET-001: a refused save retains the draft and reports at the single save bar',async({page})=>{
 await fixture(page);await page.goto(`/projects/${project}/settings-evidence`);await edit(page,'Argument redaction');await page.getByLabel('Argument redaction',{exact:true}).selectOption('allowlist');
 await page.route(`**/api/v1/projects/${project}/settings`,async route=>route.request().method()==='PATCH'?route.fulfill({status:409,json:{error:{code:'conflict',message:'Settings change refused.',requestId:'settings',retryable:false}}}):route.fallback());
 await page.getByRole('button',{name:'Save changes'}).click();await expect(page.locator('.bulkbar').getByRole('alert')).toHaveText('Settings change refused.');await expect(page.getByLabel('Argument redaction',{exact:true})).toHaveValue('allowlist');await page.getByRole('tab',{name:'Query',exact:true}).click();await expect(page.locator('.bulkbar')).toContainText('Argument redaction');await page.getByRole('button',{name:'Discard'}).click();await expect(page.getByRole('alert')).toHaveCount(0);
});

test('SET-002/SET-003: provenance, conditional warnings, keyboard tabs and the single drawer destination',async({page})=>{
 await fixture(page);await page.goto(`/projects/${project}/settings`);
 const timeout=page.locator('[data-setting="query.timeoutSeconds"]');await expect(timeout).toContainText('Needs setting');await expect(timeout.locator('.rdetail')).toBeHidden();
 const minimum=page.locator('[data-setting="query.aggregateMinGroupSize"]');await expect(minimum).toContainText('Default');await edit(page,'Minimum aggregate group size');await expect(minimum.locator('[data-state="warning"]')).toHaveCount(0);await page.getByLabel('Minimum aggregate group size',{exact:true}).fill('1');await expect(minimum.locator('[data-state="warning"]')).toContainText('removes the protection entirely');await page.getByLabel('Minimum aggregate group size',{exact:true}).fill('5');await expect(minimum.locator('[data-part="setting-state"]')).toHaveText('Set');await expect(minimum.locator('[data-state="warning"]')).toHaveCount(0);
 await page.getByRole('tab',{name:'Query',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Discovery',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('navigation',{name:'Breadcrumb'}).locator('[aria-current=page]')).toHaveText('Settings');
 await expect(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Settings',exact:true})).toHaveCount(1);await expect(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Engines',exact:true})).toHaveCount(0);
 await accessible(page);
});

for(const width of [390,900,1440])test(`SET-004: measured Settings geometry and accessibility at ${width}`,async({page},info)=>{
 await fixture(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/settings-discovery`);
 await edit(page,'Detected renames');await expect(page.getByLabel('Detected renames',{exact:true})).toBeVisible();
 const measurements=await page.evaluate(()=>{
  const root=document.querySelector<HTMLElement>('.screen[data-layout="settings"]')!,row=root.querySelector<HTMLElement>('[data-setting="discovery.renameHandling"] .frow')!,label=row.querySelector<HTMLElement>('[data-part="setting-name"]')!,select=root.querySelector<HTMLSelectElement>('#discovery\\.renameHandling')!,chevron=select.parentElement!.querySelector<SVGElement>('svg')!;
  const bounds=select.getBoundingClientRect(),arrow=chevron.getBoundingClientRect(),style=getComputedStyle(select),tabs=[...root.querySelectorAll<HTMLElement>('[role=tab]')];
  return {width:innerWidth,rowHeight:row.getBoundingClientRect().height,labelFont:getComputedStyle(label).fontSize,labelWeight:getComputedStyle(label).fontWeight,selectWidth:bounds.width,leftClearance:parseFloat(style.paddingLeft),rightClearance:bounds.right-parseFloat(style.borderRightWidth)-arrow.right,tabLines:new Set(tabs.map(t=>t.getBoundingClientRect().top)).size,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 await info.attach('settings-geometry',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});console.log('SET-004',measurements);
 expect(measurements.labelFont).toBe('13.5px');expect(measurements.labelWeight).toBe('560');expect(measurements.leftClearance).toBe(10);expect(measurements.rightClearance).toBe(10);expect(measurements.overflow).toBe(false);if(width===1440)expect(measurements.rowHeight).toBe(42);if(width===390)expect(measurements.tabLines).toBeGreaterThan(1);
 await accessible(page);const review=info.outputPath('settings-review.png');await page.screenshot({path:review,fullPage:true});await info.attach('settings-review',{path:review,contentType:'image/png'});
 // Measure the longest live Evidence select too, without changing its contract.
 await page.getByRole('tab',{name:'Evidence',exact:true}).click();await edit(page,'Argument redaction');await expect(page.getByLabel('Argument redaction',{exact:true})).toBeVisible();
 const evidencePicker=await page.getByLabel('Argument redaction',{exact:true}).evaluate(el=>{const b=el.getBoundingClientRect(),a=el.parentElement!.querySelector('svg')!.getBoundingClientRect(),s=getComputedStyle(el);return {width:b.width,left:parseFloat(s.paddingLeft),right:b.right-parseFloat(s.borderRightWidth)-a.right};});expect(evidencePicker.left).toBe(10);expect(evidencePicker.right).toBe(10);await info.attach('evidence-picker-geometry',{body:JSON.stringify(evidencePicker),contentType:'application/json'});await accessible(page);
});
