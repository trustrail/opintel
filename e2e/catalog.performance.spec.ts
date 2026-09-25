import {test} from './fixtures.js';
import { expect } from '@playwright/test';
import { project, mock, expand } from './catalog-fixture.js';
test('G-019: scrolling 5,000 loaded elements misses no refresh frames', async ({page},testInfo) => {
  test.setTimeout(60_000);
  const state=await mock(page);state.large=true;
  await page.goto(`/projects/${project}/catalog`);await expand(page);
  const tree=page.getByRole('tree',{name:'Catalogue'});
  for(let n=0;n<99;n++){
    await tree.evaluate(el=>{el.scrollTop=el.scrollHeight;});await page.getByRole('button',{name:'Load more',exact:true}).click();
    await expect.poll(()=>tree.evaluate(el=>el.scrollHeight)).toBe(((n+2)*50+3+(n===98?0:1))*46);
  }
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
  expect(result.maxRendered).toBeLessThanOrEqual(36);
});
