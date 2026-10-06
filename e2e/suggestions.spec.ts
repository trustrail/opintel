import {expect} from '@playwright/test';
import axe from 'axe-core';
import {inspectControls,controlPatterns} from './conformance/checker.js';
async function accessible(page:import('@playwright/test').Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);}
import {test} from './fixtures.js';
import {mockDashboard,project,pool,source} from './dashboard-fixture.js';
import type {Suggestion} from '../src/shared/api/suggestions.js';
const id='018f8f9d-7f83-7abc-8def-000000000005';
async function setup(page:import('@playwright/test').Page){
 const dashboard=await mockDashboard(page);
 const item:Suggestion={id,left:{id:source,name:'reinsurance.public.premium.treaty',active:true},right:{id:pool,name:'reinsurance.public.claim.treaty',active:true},queries:2,explains:3,latestAt:'2026-10-05 12:00 UTC',latestAttemptId:id,agents:['reporting-agent'],pools:[{id:pool,name:'Reporting pool'}],confirmationBlocked:null,status:'pending',raisedAgain:false,history:[]};
 const state={items:[item],error:false,loading:false};
 await page.route('**/api/v1/projects/*/suggestions**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/domains'))return route.fulfill({json:{items:[{domain:'treaty',members:[{elementId:source,name:'reinsurance.public.contract.identifier',version:1}]}],nextCursor:null}});
  if(path.endsWith('/attempts'))return route.fulfill({json:{items:[{id,operation:'explain',at:item.latestAt,agentId:'reporting-agent',statement:null,argumentVisibility:'hidden'}],nextCursor:null}});
  if(path.endsWith('/decisions')){const body=route.request().postDataJSON() as {action:'confirm'|'reject'|'not_sure';domain?:string};item.status=body.action;item.history.push({id,action:body.action,actorId:source,actorName:'Admin',at:item.latestAt,domain:body.domain??null,assignments:body.action==='confirm'?[{elementId:source,version:2}]:[]});return route.fulfill({json:{recorded:true}});}
  if(state.loading)await new Promise(r=>setTimeout(r,1500));
  return state.error?route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Suggestions unavailable',requestId:id,retryable:true}}}):route.fulfill({json:{items:state.items,nextCursor:null,projectName:'Reporting'}});
 });return {state,item,dashboard};
}
const path=`/projects/${project}/relationship-suggestions`;
test('SUG-006: drawer, explicit membership choice, confirmation and retained history',async({page})=>{
 await setup(page);await page.goto(path);
 await expect(page.getByRole('link',{name:'Suggestions',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
 await expect(page.getByRole('option',{name:/treaty — reinsurance.public.contract.identifier/})).toHaveCount(1);
 await page.getByLabel('Existing shared domain').selectOption('treaty');await page.getByLabel('Type project name: Reporting').fill('Reporting');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Decision recorded.'})).toHaveText('Decision recorded.');
 await page.getByText('Decision and assignment history (1)').click();await expect(page.getByText(/Confirmed by Admin/)).toBeVisible();await expect(page.getByText(/assignment version 2/)).toBeVisible();await page.getByRole('button',{name:'Attempts and SQL',exact:true}).click();await expect(page.getByText('SQL hidden by Activity permissions or redaction policy.')).toBeVisible();
 await accessible(page);
});
test('SUG-004/006: clear candidates block confirmation; not sure stays visible and rises on later attempt',async({page})=>{
 const {item}=await setup(page);item.confirmationBlocked='Change the clear entitlement to tokenized first.';await page.goto(path);
 await expect(page.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();await expect(page.getByRole('link',{name:'Open entitlements'})).toBeVisible();
 await page.getByRole('button',{name:'Not sure',exact:true}).click();await expect(page.getByText('Decision and assignment history (1)')).toBeVisible();
 item.raisedAgain=true;item.explains++;await page.reload();await expect(page.getByText('A later attempt raised this deferred suggestion again.')).toBeVisible();
 await accessible(page);
});
test('SUG-006: loading, empty, error and viewer states',async({page})=>{
 const {state,dashboard,item}=await setup(page);state.loading=true;await page.goto(path);await expect(page.getByText('Preparing this view').first()).toBeVisible();await expect(page.getByRole('heading',{name:/reinsurance.public.premium/})).toBeVisible();
 state.loading=false;state.items=[];await page.reload();await expect(page.getByText('No join suggestions')).toBeVisible();
 state.error=true;await page.reload();await expect(page.getByText('Suggestions could not be loaded')).toBeVisible();
 state.error=false;state.items=[item];dashboard.admin=false;await page.reload();await expect(page.getByText('Read-only. A project administrator reviews suggestions.')).toBeVisible();await expect(page.getByRole('button',{name:'Not sure',exact:true})).toBeDisabled();
 await accessible(page);
});
test('SUG-003/006: a new shared domain is an explicit choice',async({page})=>{await setup(page);await page.goto(path);await page.getByLabel('Shared domain choice').selectOption('new');await page.getByLabel('New shared domain').fill('newtreaty');await page.getByLabel('Type project name: Reporting').fill('Reporting');await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Decision recorded.'})).toHaveText('Decision recorded.');await page.getByText('Decision and assignment history (1)').click();await expect(page.getByText(/Shared domain: newtreaty/)).toBeVisible();});
for(const width of [390,900,1440])test(`@visual SUG-006: suggestion review ${width}`,async({page})=>{await setup(page);await page.setViewportSize({width,height:1000});await page.goto(path);await expect(page.getByLabel('Existing shared domain')).toBeVisible();await expect(page).toHaveScreenshot(`suggestions-${width}.png`,{fullPage:true});});
