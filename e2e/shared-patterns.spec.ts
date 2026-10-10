import {capture} from './capture.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {test} from './fixtures.js';

test('RED-001: expansion is keyboard controlled and unmounts closed detail',async({page})=>{
 await page.goto('/dev/shared-patterns');
 const disclosure=page.getByRole('button',{name:'Show record'});
 await expect(disclosure).toHaveAttribute('aria-controls','preview-record');
 await expect(disclosure).toHaveAttribute('aria-expanded','false');
 await expect(page.getByText('Whether an answer reached',{exact:false})).toHaveCount(0);
 await disclosure.focus();await page.keyboard.press('Enter');
 await expect(disclosure).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#preview-record')).toBeVisible();
 await page.keyboard.press('Space');
 await expect(disclosure).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('#preview-record')).toBeHidden();
 await expect(page.getByText('Whether an answer reached',{exact:false})).toHaveCount(0);
 await expect(page.locator('details,summary')).toHaveCount(0);
});

test('RED-002: segmented filter changes and selection bar follows its selection',async({page})=>{
 await page.goto('/dev/shared-patterns');
 const group=page.getByRole('group',{name:'Example status'}),open=group.getByRole('button',{name:'Open'});
 await open.focus();await page.keyboard.press('Space');
 await expect(open).toHaveAttribute('aria-pressed','true');
 await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Unavailable',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Cancel selection'}).click();
 await expect(page.getByRole('group',{name:'Selected decisions'})).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:'Select written premium'})).not.toBeChecked();
});

test('RED-003: shared patterns have no axe violations',async({page})=>{
 await page.goto('/dev/shared-patterns');await page.getByRole('button',{name:'Show record'}).click();
 await page.addScriptTag({content:axe.source});
 expect(await page.evaluate(async()=>(await axe.run()).violations)).toEqual([]);
});

for(const width of [390,900,1440]){
 test(`RED-004: shared patterns preserve narrow content at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.goto('/dev/shared-patterns');
  for(const text of ['written_premium_from_the_reinsurance_landing','DECIMAL(18, 2)']){
   const node=page.getByText(text,{exact:true});await expect(node).toBeVisible();
   const metrics=await node.evaluate(element=>({left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right,scroll:element.scrollWidth,client:element.clientWidth}));
   expect(metrics.left).toBeGreaterThanOrEqual(0);expect(metrics.right).toBeLessThanOrEqual(width);expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
  }
  await expect(page.getByRole('button',{name:'Declarations'})).toBeVisible();
  if(width===390){
   const consequence=page.locator('[data-part="consequence"]');
   expect(await consequence.evaluate(element=>element.getBoundingClientRect().width)).toBeGreaterThan(250);
   const bounds=await page.evaluate(()=>{
    const band=document.querySelector('[data-layout="pair"]'),bar=document.querySelector('[data-layout="weighted"]');
    if(!band||!bar)throw new Error('Preview relationship and action bar must exist.');
    // Read both in one frame: the screen's entrance animation moves both.
    return {bottom:bar.getBoundingClientRect().bottom,top:band.getBoundingClientRect().top,position:getComputedStyle(bar).position};
   });
   expect(bounds.position).toBe('static');expect(bounds.bottom).toBeLessThanOrEqual(bounds.top);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
 test(`RED-004: shared patterns snapshot at ${width}px`,{tag:'@visual'},async({page})=>{
  await page.setViewportSize({width,height:1000});await page.goto('/dev/shared-patterns');
  await page.getByRole('button',{name:'Show record'}).click();
  await capture(page,test.info(),`shared-patterns-${width}.png`,{animations:'disabled',fullPage:true});
 });
}
