import {test} from './fixtures.js';
import { expect } from '@playwright/test';
import { project, mock, expand } from './entitlements-fixture.js';
test('H-016: 5,000 elements with 200 selected stay responsive', async ({page},testInfo) => {
  test.setTimeout(60_000);
  const state=await mock(page);state.large=true;
  await page.goto(`/projects/${project}/entitlements`);await expand(page);
  await page.getByLabel('Select loaded elements',{exact:true}).check();
  await expect(page.locator('.bulkbar .n')).toHaveText('200 selected');
  const tree=page.getByRole('tree',{name:'Entitlements'});
  for(let n=0;n<24;n++){
    await tree.evaluate(el=>{el.scrollTop=el.scrollHeight;});await page.getByRole('button',{name:'Load more',exact:true}).click();
    await expect.poll(()=>tree.evaluate(el=>el.scrollHeight)).toBe(((n+2)*200+3+(n===23?0:1))*46);
  }
  await expect(page.locator('.bulkbar .n')).toHaveText('200 selected');
  const result=await tree.evaluate(async el=>{
    const frame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
    const baseline:number[]=[];let previous=await frame();
    for(let n=0;n<30;n++){const now=await frame();baseline.push(now-previous);previous=now;}
    const refresh=baseline.sort((a,b)=>a-b)[Math.floor(baseline.length/2)]!;
    const intervals:number[]=[];previous=await frame();
    for(let n=0;n<120;n++){
      el.scrollTop=(n%60)/59*(el.scrollHeight-el.clientHeight);
      const now=await frame();intervals.push(now-previous);previous=now;
    }
    return {refresh,intervals,maxRendered:el.querySelectorAll('[role=treeitem]').length};
  });
  await testInfo.attach('scroll-frame-intervals',{body:JSON.stringify(result),contentType:'application/json'});
  // A missed refresh produces a multiple of the measured display period.
  // The half-period threshold distinguishes that from timestamp rounding.
  expect(result.intervals.filter(ms=>ms>result.refresh*1.5)).toEqual([]);
  expect(result.maxRendered).toBeLessThanOrEqual(28);
  await tree.getByRole('treeitem').first().focus();await page.keyboard.press('End');
  await expect(page.getByLabel('Select field_4999',{exact:true})).not.toBeChecked();
  await page.keyboard.press('Home');await expect(page.getByLabel('Select field_0000',{exact:true})).toBeChecked();
  await expect(page.locator('.bulkbar .n')).toHaveText('200 selected');
});
