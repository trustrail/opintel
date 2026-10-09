import { reportRecordedFrames } from './recorded-performance.js';
import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {mockActivity,activityPath} from './activity-fixture.js';
test('M-015: a million-record Activity dataset pages and scrolls without dropped frames',async({page},info)=>{
 test.setTimeout(60000);const state=await mockActivity(page);expect(state.total).toBe(1000000);await page.goto(activityPath);
 const viewport=page.getByRole('region',{name:'Activity records'});await expect(viewport).toBeVisible();
 for(let n=0;n<9;n++){await page.getByRole('button',{name:'Load more requests'}).click();await expect(viewport).toHaveAttribute('data-loaded-records',String((n+2)*50));}
 const measurements=await viewport.evaluate(async el=>{
  const frame=()=>new Promise<number>(r=>requestAnimationFrame(r)),baseline:number[]=[];let previous=await frame();for(let i=0;i<30;i++){const now=await frame();baseline.push(now-previous);previous=now;}const refresh=baseline.sort((a,b)=>a-b)[15]!;
  const intervals:number[]=[];for(let i=0;i<120;i++){el.scrollTop=(i%60)/60*(el.scrollHeight-el.clientHeight);const now=await frame();intervals.push(now-previous);previous=now;}return {refresh,intervals,rendered:el.querySelectorAll('.rec[data-mark-row]').length};
 });await info.attach('activity-frames',{body:JSON.stringify(measurements),contentType:'application/json'});expect(measurements.rendered).toBeLessThanOrEqual(12);await reportRecordedFrames('M-015',info,measurements);expect(state.requests.length).toBeLessThan(30);
});
