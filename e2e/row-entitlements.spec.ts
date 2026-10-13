import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {mock,expand,project,pool,object,source} from './entitlements-fixture.js';
for(const width of [390,900,1440])test(`ROW-UI static row editor and scoped object at ${width}`,async({page})=>{
 await mock(page);let current:Record<string,unknown>|null=null;const decision='018f8f9d-7f83-7abc-8def-000000000099',column='018f8f9d-7f83-7abc-8def-000000000100';
 await page.route('**/row-entitlements/**',route=>{
  if(new URL(route.request().url()).pathname.endsWith('/history'))return route.fulfill({json:{items:current?[current]:[],nextCursor:null}});
  if(route.request().method()==='PUT'){
   const body=route.request().postDataJSON() as {expression:string;projectId:string};expect(body.projectId).toBe(project);
   if(body.expression.includes('scope('))return route.fulfill({status:422,json:{error:{code:'validation_failed',message:'scope references arrive in step 3',requestId:'row-test',retryable:false}}});
   current={id:decision,expression:body.expression,hash:'a'.repeat(64),actorId:decision,decidedAt:'2026-10-06T12:00:00Z',firstScoping:true};return route.fulfill({json:current});
  }
  return route.fulfill({json:{objectId:object,objectName:'records',poolId:pool,scoped:current!==null,columns:[{id:column,name:'field_0000',sourceIdentifier:'field_0000',type:'VARCHAR'}],current}});
 });
 await page.route('**/entitlements?*',route=>new URL(route.request().url()).searchParams.get('parent')===source+':public'?route.fulfill({json:{nodes:[{id:object,label:'records',kind:'object',childCount:7,exposedType:null,treatment:null,maskKind:null,justification:null,rowScoped:current!==null}],nextCursor:null}}):route.fallback());
 await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/entitlements`);await expand(page);
 await page.getByRole('link',{name:'Row entitlement for records'}).click();
 const editor=page.getByRole('region',{name:'Row entitlement editor'});await expect(editor).toContainText('Rows unscoped');await expect(editor.getByRole('button',{name:'Save row decision'})).toBeDisabled();
 await editor.getByRole('button',{name:'Text',exact:true}).click();
 await editor.getByLabel('Row predicate for this object and pool').fill('field_0000 IN scope(customer)');await editor.getByRole('button',{name:'Save row decision'}).click();await expect(editor.getByRole('alert')).toHaveText('scope references arrive in step 3');
 await editor.getByLabel('Row predicate for this object and pool').fill("field_0000 = 'EU'");await editor.getByRole('button',{name:'Save row decision'}).click();await expect(editor.getByRole('status')).toHaveText('Row decision saved.');await expect(editor).toContainText('Rows scoped');
 await editor.getByRole('button',{name:'Decision history'}).click();await expect(editor).toContainText('actor '+decision);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 console.info(JSON.stringify({measurement:'row-editor',width,box:await editor.boundingBox(),input:await editor.getByLabel('Row predicate for this object and pool').boundingBox()}));
 await editor.getByRole('button',{name:'Close row editor'}).click();const action=page.getByRole('link',{name:'Row entitlement for records'});if(width<600){await expect(action).toHaveAttribute('title','Rows scoped · records');const label=page.locator('[data-row-kind=object] [data-part=identity] > b');await expect(label).toHaveText('records');expect(await label.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}else await expect(action).toHaveText('Scoped');
});

 test('ROW-UI unscoped evidence stays quiet until metadata expands',async({page})=>{
 const {mockActivity,detailPath}=await import('./activity-fixture.js');await mockActivity(page);await page.goto(detailPath);
 await expect(page.getByRole('heading',{name:'Run record',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Row scope receipt'})).toHaveCount(0);
 await expect(page.getByText('Rows: unscoped at the time of the call',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();
 await expect(page.getByText('Rows: unscoped at the time of the call',{exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Row scope receipt'})).toHaveCount(0);
 });
