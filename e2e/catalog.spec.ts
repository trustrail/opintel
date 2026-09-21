import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
test.use({reducedMotion:'reduce'});
import { project, mock, expand } from './catalog-fixture.js';
const source='018f8f9d-7f83-7abc-8def-000000000002';
const object='018f8f9d-7f83-7abc-8def-000000000003';
const schema=source+':public';
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
for(const width of [390,900,1440])test(`schema explorer states, types and aliases at ${width}`,async({page})=>{
 const state=await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/catalog`);await expand(page);
 await expect(page.getByText('Renamed Warehouse',{exact:true})).toBeVisible();
 await expect(page.getByText('INTEGER',{exact:true})).toBeVisible();await expect(page.getByText('Unsupported type',{exact:true})).toBeVisible();await expect(page.getByText('Unnameable element',{exact:true})).toBeVisible();
 await expect(page).toHaveScreenshot(`catalog-${width}.png`,{fullPage:true});await accessible(page);
 await page.getByLabel('Search within').selectOption(object);await page.getByLabel('Name prefix').fill('record_n');await expect(page.getByText('record_id',{exact:true})).toHaveCount(0);await expect(page.getByText('record_name',{exact:true})).toBeVisible();expect(state.requests.at(-1)).toMatchObject({parent:object,prefix:'record_n'});
 await page.getByRole('button',{name:'Collapse records',exact:true}).click();await expect(page.getByText('record_name',{exact:true})).toHaveCount(0);
});
test('G-020: purposeful empty, loading and error states, including an empty branch',async({page})=>{
 const state=await mock(page);state.loading=true;await page.goto(`/projects/${project}/catalog`);await expect(page.getByText('Preparing this view',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Expand warehouse',exact:true})).toBeVisible();state.loading=false;
 await page.getByRole('button',{name:'Expand warehouse',exact:true}).click();await expect(page.getByRole('button',{name:'Expand public',exact:true})).toBeVisible();state.empty=true;await page.getByRole('button',{name:'Expand public',exact:true}).click();await expect(page.getByText('No catalogue entries here. Introspect the source to discover its structure.',{exact:true})).toBeVisible();
 state.error=true;await page.reload();await expect(page.getByText('The catalogue is temporarily unavailable. Try again.',{exact:true})).toBeVisible();state.error=false;
 await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('No catalogue yet',{exact:true})).toBeVisible();await accessible(page);
});
test('G-019: 5,000 elements stay virtualised while scrolling and keyboard navigation works',async({page})=>{
 test.setTimeout(60_000);const state=await mock(page);state.large=true;await page.goto(`/projects/${project}/catalog`);await expand(page);
 const tree=page.getByRole('tree',{name:'Catalogue'});
 // Exercise real bounded page fetches. No bulk fixture response disguises a wholesale fetch.
 for(let n=0;n<99;n++){
  await tree.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.getByRole('button',{name:'Load more',exact:true}).click();
  await expect.poll(()=>state.requests.filter(r=>r.parent===object).length).toBe(n+2);
  await expect.poll(()=>tree.evaluate(el=>el.scrollHeight)).toBe(((n+2)*50+3+(n===98?0:1))*46);
 }
 await expect.poll(()=>tree.evaluate(el=>el.scrollHeight)).toBe(5003*46);
 expect(await page.getByRole('treeitem').count()).toBeLessThanOrEqual(36);
 await tree.evaluate(el=>{el.scrollTop=0;});await expect(page.getByText('field_0000',{exact:true})).toBeVisible();
 await tree.getByRole('treeitem').first().focus();await page.keyboard.press('End');await expect(page.getByText('field_4999',{exact:true})).toBeVisible();await page.keyboard.press('Home');await expect(page.getByText('field_0000',{exact:true})).toBeVisible();
 const rendered=await tree.evaluate(async el=>{
  const counts:number[]=[];
  for(let frame=0;frame<60;frame++){el.scrollTop=(frame/59)*(el.scrollHeight-el.clientHeight);await new Promise(requestAnimationFrame);counts.push(el.querySelectorAll('[role=treeitem]').length);}
  return counts;
 });expect(Math.max(...rendered)).toBeLessThanOrEqual(36);
 expect(state.requests.every(r=>r.parent===''||r.parent===source||r.parent===schema||r.parent===object)).toBe(true);
});
