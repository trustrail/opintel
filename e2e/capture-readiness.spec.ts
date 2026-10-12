import {expect} from '@playwright/test';
import {test} from './fixtures.js';
import {mockActivity,activityPath} from './activity-fixture.js';
import {prepareCapture} from './capture.js';

test('Activity capture waits for the pending rollup after rows load',async({page})=>{
 await mockActivity(page);
 let release:()=>void=()=>{throw new Error('Rollup gate was not initialized.');};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/runs/summary*',async route=>{await gate;await route.fulfill({json:{counts:{all:1,refused:0,incomplete:0,answerTreated:1},days:[],custody:[]}});});
 await page.goto(activityPath);await expect(page.getByRole('region',{name:'Activity records'})).toBeVisible();
 await expect(page.locator('[data-layout="activity"]')).toHaveAttribute('aria-busy','true');
 const capture=prepareCapture(page,test.info(),'activity-data-readiness');
 release();const metadata=await capture;
 expect(metadata.activityData?.pendingAtStart.some(path=>path?.endsWith('/runs/summary'))).toBe(true);
 expect(metadata.activityData).toMatchObject({pendingDataRequests:0,rows:'success',rollup:'success',renderSettled:true});
});
