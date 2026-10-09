import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {mockActivity,activityPath} from './activity-fixture.js';
import {mockDashboard,dashboardPath} from './dashboard-fixture.js';

test.use({reducedMotion:'reduce'});
for(const width of [390,900,1440])test(`A: absolute and relative timestamp at ${width}`,async({page},info)=>{
 await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));
 const state=await mockActivity(page);state.total=50;state.entry.startedAt='2026-10-06T13:43:00Z';
 await page.route('**/api/v1/me/settings',route=>route.fulfill({json:{email:'admin@example.com',fullName:'Admin',timezone:'America/Toronto',dateFormat:'YYYY-MM-DD',reducedMotion:true}}));
 await page.setViewportSize({width,height:900});await page.goto(activityPath);
 const timestamp=page.locator('time').filter({hasText:'2026-10-06 09:43:00 EDT · 2 hours ago'}).first();
 await expect(timestamp).toBeVisible();await expect(timestamp).toHaveAttribute('datetime','2026-10-06T13:43:00Z');
 await expect(timestamp).toHaveAttribute('data-part','timestamp');expect(await timestamp.evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('normal');
 await expect(timestamp.locator('[data-part=absolute]')).toHaveText('2026-10-06 09:43:00 EDT');await expect(timestamp.locator('[data-part=relative]')).toHaveText('2 hours ago');
 await page.addScriptTag({content:axe.source});
 expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const path=`test-results/timestamp-review/${width}.png`;
 await page.screenshot({path,fullPage:true});
 await info.attach(`timestamp-${width}`,{path,contentType:'image/png'});
});

for(const timezone of ['UTC','America/Toronto'])test(`A: feed timestamp parts stay intact and visible at 390 (${timezone})`,async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));
 const state=await mockDashboard(page);state.recent=[{...state.recent[0]!,startedAt:'2026-04-01T12:00:00Z'}];
 await page.route('**/api/v1/me/settings',route=>route.fulfill({json:{email:'admin@example.com',fullName:'Admin',timezone,dateFormat:'YYYY-MM-DD',reducedMotion:true}}));
 await page.setViewportSize({width:390,height:1000});await page.goto(dashboardPath);
 const timestamp=page.locator('.feed time');await expect(timestamp).toContainText('188 days ago');
 await expect(timestamp).toHaveAttribute('data-part','timestamp');expect(await timestamp.evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('normal');
 await timestamp.evaluate(async el=>{
  await Promise.all([...el.querySelectorAll('span')].map(span=>document.fonts.load(getComputedStyle(span).font,span.textContent??'')));
  await document.fonts.ready;
 });
 await page.screenshot({path:`test-results/timestamp-review/feed-390-${timezone==='UTC'?'UTC':'Toronto'}.png`,fullPage:true});
 const parts=await timestamp.evaluate(el=>{
  const body=el.closest('.fb')!.getBoundingClientRect();
  return [...el.querySelectorAll('span')].map(span=>{const range=document.createRange();range.selectNodeContents(span);const rect=span.getBoundingClientRect();return {lines:range.getClientRects().length,nowrap:getComputedStyle(span).whiteSpace,left:rect.left-body.left,right:rect.right-body.right,top:rect.top,font:getComputedStyle(span).font,text:span.textContent,width:rect.width,bodyWidth:body.width};});
 });
 expect(parts).toHaveLength(2);
 for(const part of parts){expect(part.lines).toBe(1);expect(part.nowrap).toBe('nowrap');expect(part.left).toBeGreaterThanOrEqual(0);expect(part.right).toBeLessThanOrEqual(0.5);}
 expect(parts[1]!.top).toBeGreaterThan(parts[0]!.top);
});
