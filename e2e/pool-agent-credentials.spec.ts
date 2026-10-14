import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {mockPools,poolPath,observedCredential} from './pools-fixture.js';
import {rowReview} from './row-review.js';
for(const width of [390,900,1440])test(`CRED-008 agents credential and legacy provenance at ${width}`,{tag:'@visual'},async({page},info)=>{
 await mockPools(page);await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));await page.setViewportSize({width,height:1000});await page.goto(poolPath);
 const agents=page.getByRole('region',{name:'Pool agents'}),legacy=agents.getByRole('row').filter({has:page.getByRole('link',{name:'reporter',exact:true})}),credentialed=agents.getByRole('row').filter({has:page.getByRole('link',{name:'worker',exact:true})});
 await expect(agents.getByRole('columnheader',{name:'Credential',exact:true})).toBeVisible();await expect(legacy.getByRole('cell').nth(1)).toHaveText('pool key (legacy)');await expect(legacy.getByRole('button')).toHaveCount(0);await expect(credentialed).toContainText(observedCredential.label);
 const alias=credentialed.getByRole('button',{name:'Credential alias for worker'});await expect(alias).toHaveText(observedCredential.custodyAlias.slice(0,20)+'…');await expect(alias).toHaveAttribute('title',observedCredential.custodyAlias);await expect(alias).toHaveAttribute('aria-expanded','false');
 await expect(page.getByText('Agents are identified by the credential they present; the alias on the receipt is that credential’s. Names in the Client column are self-declared.',{exact:true})).toBeVisible();await rowReview(page,info,'agents-credential-and-legacy',width);
 await alias.focus();await page.keyboard.press('Enter');await expect(alias).toHaveAttribute('aria-expanded','true');await expect(credentialed.locator('div[id]')).toHaveText(observedCredential.custodyAlias);await rowReview(page,info,'agents-credential-expanded',width);
 await page.addScriptTag({content:axe.source});expect((await page.evaluate(async()=>await axe.run())).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
