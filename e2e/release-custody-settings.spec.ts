import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {fixture} from './settings-fixture.js';
import {project} from './dashboard-fixture.js';
for(const width of [390,900,1440])test(`REL-015: custody Settings accumulates non-secret edits and reports safe checks at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});const {state}=await fixture(page);
 let passed=false,kid='1';
 await page.route('**/custody-provider*',async route=>{
  const value=state.settings.custody as {provider?:'local'|'xq'}|undefined;
  await route.fulfill({json:{provider:value?.provider??null,available:passed,reason:passed?null:'provider_not_checked',checkedAt:passed?'2026-10-06T12:00:00Z':null,apiKeySet:true,dashboardKeySet:false,signingKeyId:kid,affectedColumns:0}});
 });
 await page.route('**/custody-provider/check',route=>{passed=true;return route.fulfill({json:{reachable:true,authenticated:true,failure:null}});});
 await page.route('**/custody-provider/rotate',route=>{kid='2';return route.fulfill({json:{signingKeyId:kid}});});
 await page.goto(`/projects/${project}/settings-project`);await expect(page.getByRole('heading',{name:'Custody',exact:true})).toBeVisible();
 const measurements=await page.locator('[role="tabpanel"]:visible .frow[data-layout="setting"]').evaluateAll(rows=>rows.map(row=>{const name=row.querySelector('[data-part="setting-name"]');return {name:name?.textContent,height:row.getBoundingClientRect().height,fontSize:name?getComputedStyle(name).fontSize:null,fontWeight:name?getComputedStyle(name).fontWeight:null};}));
 console.info(JSON.stringify({width,measurements}));await info.attach('closed-row-measurements',{body:JSON.stringify(measurements),contentType:'application/json'});
 await page.getByRole('button',{name:'Edit Provider',exact:true}).click();await page.getByRole('button',{name:'XQ',exact:true}).click();
 await page.getByRole('button',{name:'Edit Tenant',exact:true}).click();await page.getByLabel('Tenant',{exact:true}).fill('customer');
 await page.getByRole('button',{name:'Edit Region',exact:true}).click();await page.getByLabel('Region',{exact:true}).fill('CA');
 await page.getByRole('button',{name:'Edit Release grant lifetime (minutes)',exact:true}).click();await page.getByLabel('Release grant lifetime (minutes)',{exact:true}).fill('5');
 await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0]).toEqual({custody:{provider:'xq',tenant:'customer',region:'CA',grant_ttl:300}});
 await expect(page.locator('.frow').filter({hasText:'Dashboard API key'})).toContainText('Not set');await expect(page.locator('.frow').filter({hasText:'API key'}).first()).toContainText('Set');expect(await page.locator('input[type="password"]').count()).toBe(0);
 await page.getByRole('button',{name:'Connection details',exact:true}).click();await page.getByRole('button',{name:'Check connection',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Reachable · authenticated'})).toBeVisible();
 await page.getByRole('button',{name:'Signing key details',exact:true}).click();await page.getByRole('button',{name:'Rotate signing key',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Signing key 2 is in use.'})).toBeVisible();
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
