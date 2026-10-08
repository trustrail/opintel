import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {entry} from './activity-fixture.js';
import {mockDashboard,dashboardPath} from './dashboard-fixture.js';
async function setup(page:Page){
 const state=await mockDashboard(page);state.stats.asOf='2026-10-08T03:02:00.000Z';state.stats.utcDay='2026-10-08';state.stats.requests=state.stats.queries=state.stats.prompts=state.stats.refused=state.stats.incomplete=0;
 state.rows=Array.from({length:16},(_,n)=>({...entry,id:`018f8f9d-7f83-7abc-8def-${String(n+100).padStart(12,'0')}`,startedAt:n<3?'2026-10-06T12:00:00Z':n<11?'2026-10-05T12:00:00Z':'2026-09-29T12:00:00Z',status:n===0||n>=13?'refused' as const:'answered' as const}));
 await page.clock.setFixedTime(new Date(state.stats.asOf));return state;
}
for(const width of [390,900,1440])test(`RED-020: metric controls do not collide, charts show history and treatment chips stay compact at ${width}`,async({page},info)=>{
 await setup(page);await page.setViewportSize({width,height:1000});await page.goto(dashboardPath);await expect(page.locator('[data-metric=requests] .v')).toHaveText('0');
 const boxes=await page.locator('[data-layout=dashboard]').evaluate(root=>{
  const box=(el:Element)=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,display:getComputedStyle(el).display};};
  return {metrics:[...root.querySelectorAll('.tile')].map(el=>({metric:el.getAttribute('data-metric'),children:[...el.children].map(box),links:[...el.querySelectorAll('a')].map(box)})),poolLinks:[...root.querySelectorAll('.spec a')].map(box),treatments:[...root.querySelectorAll('[data-part=answer-treatments]')].map(el=>({wrapper:box(el),children:[...el.children].map(box)}))};
 });console.log(JSON.stringify({width,metricGaps:boxes.metrics.map(m=>({metric:m.metric,gaps:m.children.slice(1).map((child,n)=>child.top-m.children[n]!.bottom)})),poolWidths:boxes.poolLinks.map(l=>l.width),chipWidths:boxes.treatments.map(t=>t.children.map(c=>c.width))}));await info.attach('dashboard-layout',{body:JSON.stringify({width,...boxes},null,2),contentType:'application/json'});
 for(const metric of boxes.metrics){for(let n=1;n<metric.children.length;n++)expect(metric.children[n]!.top).toBeGreaterThanOrEqual(metric.children[n-1]!.bottom);}
 for(const group of boxes.treatments){expect(group.wrapper.display).toBe('flex');for(const child of group.children){expect(child.width).toBeLessThan(100);expect(child.right).toBeLessThanOrEqual(group.wrapper.right);}}
 for(const metric of ['requests','refused','incomplete']){
  const tile=page.locator(`[data-metric=${metric}]`);
  expect(await tile.locator('a').evaluateAll(links=>links.map(link=>getComputedStyle(link).display))).toEqual(metric==='requests'?['inline','inline','inline']:['inline']);
  expect(await tile.evaluate(el=>el.lastElementChild?.className)).toBe('spark');
  await expect(tile.locator('[data-part=chart-label]')).toHaveText('Last 7 days (UTC)');
  await expect(tile.locator('.spark [data-part=baseline]')).toHaveCount(1);
  await expect(tile.locator('.spark [data-part=day-position]')).toHaveCount(7);
  const chart=await tile.locator('.spark').evaluate(el=>{const bounds=el.getBoundingClientRect(),svg=el.querySelector('svg')!.getBoundingClientRect();return {bottom:bounds.bottom,svgBottom:svg.bottom,bars:[...el.querySelectorAll('rect')].map(bar=>Number(bar.getAttribute('y'))+Number(bar.getAttribute('height')))};});
  expect(chart.svgBottom).toBe(chart.bottom);expect(chart.bars).toEqual(Array(7).fill(21));
 }
 await expect(page.locator('[data-metric=requests] .spark rect')).toHaveCount(7);await expect(page.locator('[data-metric=requests] .spark rect[data-day="2026-10-05"]')).toHaveAttribute('height','21');await expect(page.locator('[data-metric=requests] .spark rect[data-day="2026-10-08"]')).toHaveAttribute('height','0');
 const recent=page.getByRole('region',{name:'Recently',exact:true});
 await expect(recent.getByRole('link',{name:'Open Activity',exact:true})).toHaveCount(0);
 const gap=await recent.evaluate(el=>el.querySelector('.card')!.getBoundingClientRect().top-el.querySelector('h2')!.getBoundingClientRect().bottom);
 expect(gap).toBeGreaterThanOrEqual(10);console.log(JSON.stringify({width,chartBaseline:21,recentHeadingGap:gap}));
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const day of ['2026-10-08','2026-10-06'])test(`RED-019: Dashboard counts equal displayed Activity totals after following links on ${day}`,async({page})=>{
 const state=await setup(page);state.stats.asOf=`${day}T23:00:00.000Z`;state.stats.utcDay=day;await page.clock.setFixedTime(new Date(state.stats.asOf));
 for(const metric of ['requests','refused']){
  await page.goto(dashboardPath);const tile=page.locator(`[data-metric=${metric}]`);await expect(tile.locator('.v')).toHaveText(day==='2026-10-08'?'0':metric==='requests'?'3':'1');
  const dashboardCount=Number(await tile.locator('.v').textContent());
  expect(await tile.locator('.spark rect').evaluateAll(bars=>bars.reduce((n,bar)=>n+Number(bar.getAttribute('data-count')),0))).toBe(metric==='requests'?11:1);
  await tile.getByRole('link',{name:'Open Activity',exact:true}).click();
  const destination=page.getByRole('button',{name:metric==='requests'?/^All \d+$/:/^Refused \d+$/});await expect(destination).toBeVisible();
  await expect(destination.locator('.g')).toHaveText(String(dashboardCount));
 }
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.getByRole('button',{name:'All 16',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refused 4',exact:true})).toBeVisible();
});
