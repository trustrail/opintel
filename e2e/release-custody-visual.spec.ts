import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {capture} from './capture.js';
import {fixture} from './settings-fixture.js';
import {project} from './dashboard-fixture.js';
import {mockActivity,activityPath,detailPath,id} from './activity-fixture.js';
for(const width of [390,900,1440]){
 test(`5.36 custody Settings states ${width}`,{tag:'@visual'},async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width,height:1000});const {state}=await fixture(page);let mode='unset';
  await page.route('**/custody-provider',route=>route.fulfill({json:{provider:mode==='unset'?null:'xq',available:mode==='passed',reason:mode==='failed'?'provider_check_failed':'provider_not_checked',checkedAt:['passed','failed'].includes(mode)?'2026-10-06T12:00:00Z':null,apiKeySet:mode!=='unset',dashboardKeySet:false,signingKeyId:'1',affectedColumns:0}}));
  await page.route('**/custody-provider/check',route=>route.fulfill({json:mode==='failed'?{reachable:true,authenticated:false,failure:'authentication_refused'}:{reachable:true,authenticated:true,failure:null}}));
  for(const next of ['unset','set','passed','failed']){mode=next;state.settings={...state.settings,custody:next==='unset'?{}:{provider:'xq',tenant:'customer',region:'CA',grant_ttl:600}};await page.goto(`/projects/${project}/settings-project`);await page.reload();await expect(page.getByRole('heading',{name:'Custody',exact:true})).toBeVisible();if(next!=='unset'){const disclosure=page.getByRole('button',{name:'Connection details',exact:true});if(await disclosure.getAttribute('aria-expanded')!=='true')await disclosure.click();if(['passed','failed'].includes(next)){await page.getByRole('button',{name:'Check connection',exact:true}).click();await expect(page.getByRole('status').filter({hasText:next==='passed'?'Reachable · authenticated':'Reachable · authentication refused'})).toBeVisible();}}
   await capture(page,test.info(),`custody-settings-${next}-${width}.png`,{fullPage:true});
   if(next!=='unset'){const row=page.locator('[data-custody-credential="true"]').filter({hasText:'Dashboard API key'});const boxes=await row.evaluate(el=>[...el.children].map(c=>c.getBoundingClientRect().toJSON()));expect(boxes[1]!.right).toBeLessThanOrEqual(boxes[2]!.left);}
  }
 });
 test(`5.36 custody Activity rollup and receipt ${width}`,{tag:'@visual'},async({page})=>{
  await page.setViewportSize({width,height:1000});const state=await mockActivity(page);await page.goto(activityPath);await expect(page.getByRole('heading',{name:'Requests',exact:true})).toBeVisible();await expect(page.getByLabel('Custody receipt summary')).toHaveCount(0);await capture(page,test.info(),`custody-activity-absent-${width}.png`,{fullPage:true});
  await page.route('**/runs/summary*',route=>route.fulfill({json:{counts:{all:12,refused:0,incomplete:0,answerTreated:12},days:[],custody:[{day:'2026-09-01',state:'granted',origin:null,count:12},{day:'2026-09-01',state:'redeemed',origin:'CA',count:8},{day:'2026-09-01',state:'redeemed',origin:'US',count:1},{day:'2026-09-01',state:'expired',origin:null,count:2},{day:'2026-09-01',state:'revoked',origin:null,count:1}]}}));await page.reload();await expect(page.getByLabel('Custody receipt summary')).toHaveText("Custody · 12 granted · 9 Opintel share released · 2 expired · 1 revoked · origins CA 8, US 1 · This does not evidence that the agent obtained the provider's share or decrypted the value.");await capture(page,test.info(),`custody-activity-present-${width}.png`,{fullPage:true});
  state.record={...state.record,metadata:{...state.record.metadata,delivered:{custody:1}},elements:[{elementId:id,exposedName:'treaty_ref',state:'released',treatment:'custody',withheldReason:null}],releaseEvents:[{grantId:id,receipt:id,provider:'local',kind:'granted',at:'2026-09-01T12:00:01Z',alias:`agent:${project}:${id}`,actor:null,jurObserved:null}]};await page.goto(detailPath);await expect(page.getByText(/^released under custody \(local\)/u)).toBeVisible();await capture(page,test.info(),`custody-receipt-granted-${width}.png`,{fullPage:true});
 });
}
