import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {mockActivity,activityPath,detailPath,pool} from './activity-fixture.js';
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test.use({reducedMotion:'reduce'});
for(const width of [390,900,1440])test(`5.12 Activity and record at ${width}`,{tag:'@visual'},async({page})=>{
 await mockActivity(page);await page.setViewportSize({width,height:1000});await page.goto(activityPath);await expect(page.getByRole('heading',{name:'Requests',exact:true})).toBeVisible();await accessible(page);await expect(page).toHaveScreenshot(`activity-${width}.png`,{fullPage:true});
 await page.getByRole('region',{name:'Activity records'}).getByRole('listitem').first().getByRole('link').click();await expect(page.getByRole('heading',{name:'Versions recorded at open'})).toBeVisible();await expect(page.getByText('Catalogue generation')).toBeVisible();await accessible(page);await expect(page).toHaveScreenshot(`record-${width}.png`,{fullPage:true});
 await page.getByRole('navigation',{name:'Breadcrumb'}).getByRole('link',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'Activity',exact:true})).toBeVisible();
});
test('5.12 filters, cursor loading, empty, error, loading and incomplete states',async({page})=>{
 const state=await mockActivity(page);state.loading=true;await page.goto(activityPath);await expect(page.getByText('Preparing this view')).toBeVisible();await expect(page.getByRole('region',{name:'Activity records'}).getByRole('listitem').first()).toBeVisible();state.loading=false;
 await page.getByLabel('Pool',{exact:true}).selectOption(pool);await expect.poll(()=>state.requests.at(-1)).toContain('poolId='+pool);
 await page.getByLabel('Outcome',{exact:true}).selectOption('incomplete');await expect.poll(()=>state.requests.at(-1)).toContain('outcome=incomplete');
 await page.getByRole('button',{name:'Load more requests'}).click();await expect.poll(()=>state.requests.at(-1)).toContain('cursor=50');expect(await page.getByRole('region',{name:'Activity records'}).getByRole('listitem').count()).toBeLessThanOrEqual(12);
 state.empty=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByText('No requests match',{exact:true})).toBeVisible();await accessible(page);
 state.error=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByText('Evidence is temporarily unavailable.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('No requests match',{exact:true})).toBeVisible();
 state.record={...state.record,status:'incomplete',completedAt:null,tokenKeyVersionUsed:null,rowCount:null,latencyMs:null,synthetic:null,elements:[],stages:[],sources:[]};await page.goto(detailPath);await expect(page.getByText('Incomplete: the run opened but no completion was recorded. An answer is not established.')).toBeVisible();await expect(page.getByText('Unknown — incomplete')).toBeVisible();await accessible(page);
 state.loading=true;await page.reload();await expect(page.getByText('Preparing this view')).toBeVisible();await expect(page.getByText('Unknown — incomplete')).toBeVisible();state.loading=false;
 state.error=true;await page.reload();await expect(page.getByText('Evidence is temporarily unavailable.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('Unknown — incomplete')).toBeVisible();
 state.missing=true;await page.reload();await expect(page.getByText('Record not found',{exact:true})).toBeVisible();await accessible(page);
});
