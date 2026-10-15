import {releaseEvidenceMeaning} from '../src/shared/release-contract.js';
import {test} from './fixtures.js';
import {prepareCapture} from './capture.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {mockActivity,detailPath,activityPath,project,id} from './activity-fixture.js';
for(const width of [390,900,1440])test(`5.36 custody receipt, revocation and accessibility at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const state=await mockActivity(page);state.total=1;
 state.record={...state.record,metadata:{...state.record.metadata,delivered:{custody:1}},elements:[{elementId:id,exposedName:'treaty_ref',state:'released',treatment:'custody',withheldReason:null}],releaseEvents:[{grantId:id,receipt:id,provider:'local',kind:'granted',at:'2026-09-01T12:00:01Z',alias:`agent:${project}:${id}`,actor:null,jurObserved:null}]};
 state.record.releaseEvents.push({...state.record.releaseEvents[0]!,kind:'redeemed',evidenceMeaning:releaseEvidenceMeaning,at:'2026-09-01T12:00:30Z'});
 let revocations=0;
 await page.route('**/releases/*/revoke',async route=>{revocations++;state.record.releaseEvents.push({...state.record.releaseEvents[0]!,kind:'revoked',at:'2026-09-01T12:01:00Z',actor:id});await route.fulfill({json:{revoked:true}});});
 await page.goto(detailPath);
 await expect(page.getByRole('heading',{name:'Released under custody (local)',exact:true})).toBeVisible();
 await prepareCapture(page,test.info(),`custody-receipt-${width}`);
 await expect(page.getByText(/^released under custody \(local\)/u)).toContainText("Opintel share released");
 await expect(page.getByText(/^released under custody \(local\)/u)).toContainText("This does not evidence that the agent obtained the provider's share or decrypted the value.");
 await page.getByRole('button',{name:'Revoke remaining release access',exact:true}).click();
 await expect(page.getByText(/released under custody \(local\).*revoked/u)).toBeVisible();expect(revocations).toBe(1);
 await expect(page.getByRole('status').filter({hasText:'Already received keys cannot be recalled.'})).toBeVisible();
 await page.route('**/runs/summary*',route=>route.fulfill({json:{counts:{all:12,refused:0,incomplete:0,answerTreated:12},days:[],custody:[{day:'2026-09-01',state:'granted',origin:null,count:12},{day:'2026-09-01',state:'redeemed',origin:'CA',count:8},{day:'2026-09-01',state:'redeemed',origin:'US',count:1},{day:'2026-09-01',state:'expired',origin:null,count:2},{day:'2026-09-01',state:'revoked',origin:null,count:1}]}}));
 await page.goto(activityPath);await expect(page.getByLabel('Custody receipt summary')).toHaveText("Custody · 12 granted · 9 Opintel share released · 2 expired · 1 revoked · origins CA 8, US 1 · This does not evidence that the agent obtained the provider's share or decrypted the value.");
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('5.36: Activity adds no rollup when there are no custody grants',async({page})=>{await mockActivity(page);await page.goto(activityPath);await expect(page.getByRole('heading',{name:'Requests',exact:true})).toBeVisible();await expect(page.getByLabel('Custody receipt summary')).toHaveCount(0);});
