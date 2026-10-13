import {rowReview} from './row-review.js';
import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {mockPools,poolPath} from './pools-fixture.js';
import {mockActivity,detailPath} from './activity-fixture.js';
import {mock,project,pool,object} from './entitlements-fixture.js';
const column='018f8f9d-7f83-7abc-8def-000000000100',decision='018f8f9d-7f83-7abc-8def-000000000099';
for(const width of [390,900,1440])test(`ROW-2B builder, inherited default, preview and historical decision at ${width}`,async({page},info)=>{
 await mock(page);await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));let aggregate=false;
 const base={id:decision,level:'object_default',expression:'"region" = \'EU\'',hash:'a'.repeat(64),actorId:decision,decidedAt:'2026-10-06T12:00:00Z',firstScoping:true};
 await page.route('**/row-decisions/*',route=>route.fulfill({json:base}));
 await page.route('**/row-entitlements/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/history'))return route.fulfill({json:{items:[base],nextCursor:null}});
  if(path.endsWith('/preview'))return route.fulfill({json:{total:12,entitled:aggregate?null:6,belowThreshold:aggregate,columns:aggregate?[]:['region'],rows:aggregate?[]:[['EU']],aggregateColumns:aggregate?['region']:[],custodyColumns:[],receiptId:decision}});
  if(route.request().method()==='PUT'){const body=route.request().postDataJSON() as {expression:string};if(body.expression.includes('scope('))return route.fulfill({status:422,json:{error:{code:'validation_failed',message:'scope references arrive in step 3',requestId:'test',retryable:false}}});return route.fulfill({json:{...base,...body,level:'pool_override'}});}
  return route.fulfill({json:{objectId:object,objectName:'records',poolId:pool,scoped:true,columns:[{id:column,name:'region',sourceIdentifier:'region',type:'VARCHAR'}],current:null,objectDefault:base,effectiveExpression:base.expression,pools:[{id:pool,name:'Reporting',status:'inherited'},{id:decision,name:'Restricted',status:'overridden'}]}});
 });
 await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/entitlements?poolId=${pool}&rowObjectId=${object}&rowDecisionId=${decision}`);
 const editor=page.getByRole('region',{name:'Row entitlement editor'});await expect(editor.getByRole('region',{name:'Historical row decision'})).toContainText('region');await expect(editor).toContainText('Object default (read-only)');await expect(editor).toContainText('Reporting · inherited');await expect(editor).toContainText('Restricted · overridden');
 await editor.getByRole('button',{name:'Start predicate'}).click();await expect(editor.getByRole('combobox',{name:'Column condition 1',exact:true})).toBeVisible();await expect(editor.getByRole('combobox',{name:'Operator condition 1',exact:true})).toHaveValue('IS NOT NULL');
 await editor.getByRole('button',{name:'AND group',exact:true}).click();await expect(editor.getByRole('group',{name:'AND group · ( … )'})).toBeVisible();
 await editor.getByRole('button',{name:'Text',exact:true}).click();await expect(editor.getByLabel('Row predicate for this object and pool')).toHaveValue(/\(.+ AND .+\)/);
 await editor.getByLabel('Row predicate for this object and pool').fill("region = 'EU'");await editor.getByRole('button',{name:'Builder',exact:true}).click();await expect(editor.getByRole('combobox',{name:'Operator condition 1',exact:true})).toHaveValue('=');await expect(editor.getByText("the agent's",{exact:false})).toHaveCount(0);const heights=await editor.locator('[data-part=predicate-row] > .sel,[data-part=predicate-row] > .inp').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));expect(heights).toEqual([36,36,36]);await rowReview(page,info,'builder-valid',width);await rowReview(page,info,'object-inherited-overridden',width);
 await editor.getByRole('button',{name:'Preview rows',exact:true}).click();await expect(editor).toContainText('6 entitled rows out of 12 total');await expect(editor.getByRole('region',{name:'Treated preview samples'})).toContainText('EU');await rowReview(page,info,'preview-rows',width);
 aggregate=true;await editor.getByRole('button',{name:'Preview rows',exact:true}).click();await expect(editor).toContainText('below the disclosure threshold out of 12 total');await expect(editor.getByRole('region',{name:'Treated preview samples'})).toHaveCount(0);await rowReview(page,info,'preview-aggregate-only',width);
 await editor.getByRole('button',{name:'Text',exact:true}).click();await editor.getByLabel('Row predicate for this object and pool').fill('region IN scope(customer)');await editor.getByRole('button',{name:'Save row decision'}).click();await expect(editor.getByRole('alert')).toHaveText('scope references arrive in step 3');await rowReview(page,info,'builder-refused',width);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await info.attach('row-console-layout',{body:JSON.stringify({width,editor:await editor.boundingBox(),default:await editor.getByText(/Object default \(read-only\)/).boundingBox()}),contentType:'application/json'});
});

for(const width of [390,900,1440])test(`ROW-2B pool override entry and receipt decision link at ${width}`,async({page},info)=>{
 await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));await mockPools(page);await page.setViewportSize({width,height:1000});
 await page.route('**/row-entitlements?*',route=>route.fulfill({json:{items:[{id:object,name:'records',status:'inherited'}],nextCursor:null}}));
 await page.route('**/row-entitlements/*',route=>route.fulfill({json:{objectId:object,objectName:'records',poolId:pool,scoped:true,columns:[{id:column,name:'region',sourceIdentifier:'region',type:'VARCHAR'}],current:null,objectDefault:{id:decision,level:'object_default',expression:"region = 'EU'",hash:'a'.repeat(64),actorId:decision,decidedAt:'2026-10-06T12:00:00Z',firstScoping:true},pools:[{id:pool,name:'Reporting pool',status:'inherited'}]}}));
 await page.route('**/row-entitlements/*/history?*',route=>route.fulfill({json:{items:[],nextCursor:null}}));
 await page.goto(poolPath);await expect(page.getByRole('region',{name:'Pool row entitlements'})).toContainText('Inherits from object');await page.getByRole('button',{name:'Edit rows for records'}).click();await expect(page.getByRole('region',{name:'Row entitlement editor'})).toContainText('Object default (read-only)');await rowReview(page,info,'pool-override-editor',width);
 const activity=await mockActivity(page);activity.record.metadata.rowScopes=[{objectId:object,objectName:'records',poolId:pool,decisionId:decision,decisionIds:[decision,column],hash:'a'.repeat(64),columns:['region'],entitledRows:6,provenance:'agent credential',missingDecision:false}];
 await page.goto(detailPath);const receipt=page.getByRole('region',{name:'Row scope receipt'});await expect(receipt.getByRole('link')).toHaveCount(2);await expect(receipt.getByRole('link').first()).toHaveAttribute('href',new RegExp('rowDecisionId='+decision));await rowReview(page,info,'receipt-link',width);
});
