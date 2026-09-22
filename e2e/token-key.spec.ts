import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
test.use({reducedMotion:'reduce'});
const projectId='018f8f9d-7f83-7abc-8def-000000000001',companyId='018f8f9d-7f83-7abc-8def-000000000002';
const version=(v:number,state:'current'|'retired',result:'ok'|'failed'|'mismatch'|null)=>({version:v,state,createdAt:'2026-09-01T12:00:00Z',createdBy:{id:companyId,email:'admin@example.com'},reason:v===1?null:'Confirmed change',backupVerifiedAt:result==='ok'?'2026-09-21T12:00:00Z':null,lastRehearsedAt:result===null?null:'2026-09-21T12:00:00Z',lastRehearsal:result});
async function mock(page:Page){
 const state={view:{currentVersion:2 as number|null,versions:[version(2,'current','failed'),version(1,'retired','mismatch')]},companyAdmin:true,companyError:false,loadError:false,forbidden:false,loading:false,failAction:false,rehearsalFails:false,readCount:0,
  requests:[] as {action:string;body:Record<string,unknown>;key:string|undefined}[]};
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id:companyId,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00Z',deviceConfirmed:true}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:projectId,name:'Reporting',company:{id:companyId,name:'Example Company'},industry:{id:companyId,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
  if(path.endsWith('/companies'))return state.companyError?route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Company membership could not be checked.',requestId:'company',retryable:true}}}):route.fulfill({json:{items:[{id:companyId,name:'Example Company',role:state.companyAdmin?'admin':'member',projectCount:1}],nextCursor:null}});
  if(path.endsWith('/members'))return route.fulfill({json:{items:[],nextCursor:null}});
  if(path.endsWith('/token-key')){
   state.readCount++;
   if(state.loading)await new Promise(resolve=>setTimeout(resolve,1200));
   if(state.loadError||state.forbidden)return route.fulfill({status:state.forbidden?403:503,json:{error:{code:state.forbidden?'forbidden':'dependency_unavailable',message:state.forbidden?'You must administer this project.':'Custody metadata could not be read.',requestId:'load',retryable:!state.forbidden}}});
   return route.fulfill({json:state.view});
  }
  if(path.includes('/token-key/')){
   const action=path.split('/').at(-1)!;
   state.requests.push({action,body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
   if(state.failAction)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Token key escrow write failed. Check the configured backup location and retry.',requestId:'action',retryable:true}}});
   if(action==='rotate')state.view={currentVersion:3,versions:[version(3,'current','ok'),...state.view.versions.map(v=>({...v,state:'retired' as const}))]};
   if(action==='rehearse'&&!state.rehearsalFails)state.view={...state.view,versions:state.view.versions.map(v=>version(v.version,v.state,'ok'))};
   return route.fulfill({json:state.view});
  }
  return route.fulfill({status:404,json:{}});
 });return state;
}
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
for(const width of [390,900,1440])test(`K7: token key and confirmation at ${width}`, { tag: '@visual' },async({page})=>{
 await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${projectId}/token-key`);
 await expect(page.getByRole('heading',{name:'Current version · 2'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Access',exact:true})).toHaveAttribute('aria-current','true');
 await expect(page.getByText('Opintel cannot recover a lost key.',{exact:true})).toBeVisible();
 const failure=page.getByRole('alert',{name:'Rehearsal failure'});await expect(failure).toContainText('Version 1: escrow does not match');await expect(failure).toContainText('Version 2: escrow could not be verified');
 await accessible(page);await expect(page).toHaveScreenshot(`token-key-${width}.png`,{fullPage:true});
 await page.getByRole('button',{name:'Rotate key',exact:true}).click();
 await expect(page.getByLabel('Type Reporting to confirm')).toBeFocused();
 await expect(page.getByText('Rotation creates and verifies a new key before making it current.',{exact:false})).toBeVisible();
 await page.getByLabel('Reason for rotation').fill('Approved rotation');await page.getByLabel('Type Reporting to confirm').fill('Reporting');
 await accessible(page);await page.evaluate(()=>window.scrollTo(0,0));await expect(page).toHaveScreenshot(`token-key-confirm-${width}.png`,{fullPage:true});
});
test('typed rotation, retry idempotency, exact error text and refreshed status',async({page})=>{
 const state=await mock(page);await page.goto(`/projects/${projectId}/token-key`);await page.getByRole('button',{name:'Rotate key',exact:true}).click();
 const submit=page.getByRole('button',{name:'Confirm rotation',exact:true});await expect(submit).toBeDisabled();
 await page.getByLabel('Reason for rotation').fill('Approved rotation');await page.getByLabel('Type Reporting to confirm').fill('reporting');await expect(submit).toBeDisabled();expect(state.requests).toEqual([]);
 state.failAction=true;await page.getByLabel('Type Reporting to confirm').fill('Reporting');await submit.click();
 await expect(page.getByRole('alert').filter({hasText:'Token key escrow write failed.'})).toHaveText('Token key escrow write failed. Check the configured backup location and retry.');
 expect(state.requests[0]?.body).toEqual({confirmation:'Reporting',reason:'Approved rotation'});expect(state.requests[0]?.key).toBeTruthy();
 state.failAction=false;const reads=state.readCount;await submit.click();await expect(page.getByRole('status',{name:'Token key operation'})).toHaveText('Rotation complete. Current version: 3.');
 expect(state.requests[1]?.key).toBe(state.requests[0]?.key);expect(state.readCount).toBeGreaterThan(reads);await expect(page.getByRole('heading',{name:'Current version · 3'})).toBeVisible();
});
test('restore explains replacement and selects a retained version; rehearse clears failures without confirmation',async({page})=>{
 const state=await mock(page);await page.goto(`/projects/${projectId}/token-key`);
 await page.getByRole('button',{name:'Restore version 1'}).click();await expect(page.getByText('Restore replaces this version of the stored key with its verified escrow copy.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirm restore'})).toBeDisabled();await page.getByLabel('Type Reporting to confirm').fill('Reporting');await page.getByRole('button',{name:'Confirm restore'}).click();
 await expect(page.getByRole('status',{name:'Token key operation'})).toHaveText('The verified escrow copy was restored.');expect(state.requests[0]).toMatchObject({action:'restore',body:{keyVersion:1,confirmation:'Reporting'}});
 await page.getByRole('button',{name:'Rehearse now'}).click();await expect(page.getByRole('status',{name:'Token key operation'})).toHaveText('All retained key versions passed the rehearsal.');await expect(page.getByRole('alert',{name:'Rehearsal failure'})).toHaveCount(0);expect(state.requests.at(-1)?.body).toEqual({});await accessible(page);
});
test('company administration gates restore; loading, empty, error and forbidden states are explicit',async({page})=>{
 const state=await mock(page);state.companyAdmin=false;state.loading=true;await page.goto(`/projects/${projectId}/token-key`);await expect(page.getByText('Preparing this view',{exact:true})).toBeVisible();state.loading=false;
 await expect(page.getByRole('heading',{name:'Current version · 2'})).toBeVisible();await expect(page.getByRole('button',{name:/Restore version/})).toHaveCount(0);await expect(page.getByText('Restoring a key requires both project and company administration.',{exact:true})).toBeVisible();
 state.view={currentVersion:null,versions:[]};await page.reload();await expect(page.getByText('No token key yet',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Rotate key',exact:true})).toHaveCount(0);await accessible(page);
 state.loadError=true;await page.reload();await expect(page.getByText('Custody metadata could not be read.',{exact:true})).toBeVisible();state.loadError=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('No token key yet',{exact:true})).toBeVisible();
 state.forbidden=true;await page.reload();await expect(page.getByText('You must administer this project.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Rehearse now'})).toHaveCount(0);
});
test('Access links to the token key screen',async({page})=>{
 await mock(page);await page.goto(`/projects/${projectId}/access`);await page.getByRole('link',{name:'Manage token key'}).click();await expect(page.getByRole('heading',{name:'Token key',exact:true})).toBeVisible();
});

test('a completed rehearsal with failures stays prominent; failed company checks do not enable restore',async({page})=>{
 const state=await mock(page);state.companyError=true;state.rehearsalFails=true;await page.goto(`/projects/${projectId}/token-key`);
 await expect(page.getByText('Company membership could not be checked.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Restore version/})).toHaveCount(0);
 await page.getByRole('button',{name:'Rehearse now'}).click();await expect(page.getByRole('status',{name:'Token key operation'})).toHaveText('Rehearsal finished with failures. Review the affected versions above.');await expect(page.getByRole('alert',{name:'Rehearsal failure'})).toBeVisible();
});
