import {test} from './fixtures.js';
import {expect,type Locator} from '@playwright/test';
import axe from 'axe-core';
import {mockDashboard,dashboardPath} from './dashboard-fixture.js';
import {mock as mockEntitlements,project} from './entitlements-fixture.js';
const order=['clear','tokenized','masked','aggregate_only','withheld','undecided'];
async function checkSpectrum(panel:Locator){
 const bar=panel.locator('.bar');await expect(bar).toHaveAttribute('role','group');
 const segments=bar.locator('[data-treatment]'),legend=panel.locator('.speclegend > [data-treatment]');
 expect(await segments.evaluateAll(items=>items.map(el=>el.getAttribute('data-treatment')))).toEqual(order);
 expect(await legend.evaluateAll(items=>items.map(el=>el.getAttribute('data-treatment')))).toEqual(order);
 await expect(panel.locator('.speclegend')).toHaveCSS('display','flex');
 const positions=await legend.evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,left:r.left};}));
 for(let i=1;i<positions.length;i++){const before=positions[i-1]!,after=positions[i]!;expect(after.top).toBeGreaterThanOrEqual(before.top);if(after.top===before.top)expect(after.left).toBeGreaterThan(before.left);}
 for(let i=0;i<order.length;i++){
  const segment=segments.nth(i),entry=legend.nth(i),text=(await entry.textContent())!.trim(),match=text.match(/(\d+)$/u)!;
  const label=text.slice(0,-match[1]!.length).trim(),name=await segment.getAttribute('aria-label');
  expect(name).toMatch(new RegExp(`^${label}: ${match[1]} (decisions|members)$`));await expect(segment).toHaveAttribute('title',name!);
  await expect(bar.getByRole('img',{name:name!,exact:true})).toHaveCount(1);
  if(Number(match[1])>0)await expect(segment).toBeVisible();
 }
}
for(const width of [390,900,1440])for(const screen of ['Dashboard','Entitlements'])test(`Treatment spectrum: ${screen} legend follows bar and names every segment at ${width}`,async({page})=>{
 if(screen==='Dashboard')await mockDashboard(page);else await mockEntitlements(page);
 await page.setViewportSize({width,height:1000});await page.goto(screen==='Dashboard'?dashboardPath:`/projects/${project}/entitlements`);
 const panel=page.getByRole('region',{name:screen==='Dashboard'?'Exposure':'Decision distribution',exact:true});
 await expect(panel.locator('.speclegend > div')).toHaveCount(6);await checkSpectrum(panel);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
