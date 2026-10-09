import {test} from './fixtures.js';
import { sourceMessages } from '../src/shared/source-errors.js';
import { expect,type Page } from '@playwright/test';
import axe from 'axe-core';
test.use({ reducedMotion: 'reduce' });
const projectId='018f8f9d-7f83-7abc-8def-000000000001';
const industryId='018f8f9d-7f83-7abc-8def-000000000002';
const sourceId='018f8f9d-7f83-7abc-8def-000000000003';
const demoId='018f8f9d-7f83-7abc-8def-000000000004';
const project={id:projectId,name:'Reporting',company:{id:industryId,name:'Example Company'},industry:{id:industryId,name:'General'},region:'eu-west-1',role:'admin'};
const source={id:sourceId,name:'Monthly returns',exposedAlias:'monthly_returns',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:'append_as_at',filingCount:2,engineId:demoId,objectCount:1,lastLandedAt:'2026-09-19T11:00:00.000Z',quarantinedCount:0,decisionPools:[{id:industryId,name:'Development Demo',undecidedCount:0,decisions:[{value:'clear',count:2},{value:'tokenized',count:3}]},{id:demoId,name:'toto',undecidedCount:5,decisions:[{value:'undecided',count:5}]}],elementCount:7,unsupportedCount:2,undecidedCount:5,latestIntrospectionId:null,lastIntrospectedAt:'2026-09-19T12:00:00.000Z'};
export async function mock(page:Page){
 const state={status:'connected',conflictRun:null as string|null,empty:false,error:false,loading:false,prepared:false,canConnect:true,retries:[] as unknown[],failure:null as string|null,creates:[] as Record<string,unknown>[],tests:[] as unknown[]};
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id:industryId,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
  if(path.endsWith('/engines'))return route.fulfill({json:{items:[{id:demoId,name:'Reporting engine',address:'https://engine.internal:3100',certificatePin:'AB'.repeat(32),contractVersion:2,verifiedAt:'2026-10-04T12:00:00Z',lastSeenAt:'2026-10-04T12:00:00Z',health:'healthy',healthMessage:null,custody:true,sources:[]}],nextCursor:null}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{...project,role:state.canConnect?'admin':'viewer'}],nextCursor:null}});
  if(path.endsWith('/demo-sources'))return route.fulfill({json:[{id:demoId,name:'Industry demo',narrative:'A set of synthetic filings in inconsistent formats, processed through ordinary ingest.',prepared:state.prepared,connected:false}]});
  if(path.endsWith('/introspect')){state.retries.push(route.request().postDataJSON());if(state.conflictRun)return route.fulfill({status:409,json:{error:{code:'conflict',message:`This source already has an active introspection run: ${state.conflictRun}. Wait for it to finish before re-introspecting.`,details:{runId:state.conflictRun},requestId:'test',retryable:false}}});state.failure=null;return route.fulfill({status:202,json:{...source,status:'pending'}});}
  if(path.endsWith('/sources/test')){state.tests.push(route.request().postDataJSON());return route.fulfill({json:{reachable:true,reason:null,schemas:['public','returns']}});}
  if(path.endsWith('/sources')&&route.request().method()==='POST'||path.endsWith('/sources/from-demo')){state.creates.push(route.request().postDataJSON() as Record<string,unknown>);state.empty=false;return route.fulfill({status:201,json:source});}
  if(path.endsWith('/sources')){
   if(state.loading)await new Promise(resolve=>setTimeout(resolve,3000));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Sources are temporarily unavailable.',requestId:'sources-test',retryable:true}}});
   return route.fulfill({json:{items:state.empty?[]:[{...source,status:state.status,...(state.failure?{status:'introspection_failed',error:state.failure,latestIntrospectionId:industryId}:{})},{...source,id:demoId,name:'Demo returns',origin:'demo',landingStrategy:'table_per_filing',filingCount:1}],nextCursor:null}});
  }
  return route.fulfill({status:404,json:{}});
 });return state;
}
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
for(const width of [390,900,1440])test(`Data sources ready, empty and wizard at ${width}`, { tag: '@visual' },async({page:initialPage})=>{
 let page=initialPage;let state=await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${projectId}/data-sources`);
 await expect(page.getByText('Monthly returns',{exact:true})).toBeVisible();await expect(page.getByText('table per filing',{exact:true})).toBeVisible();
 await expect(page).toHaveScreenshot(`sources-ready-${width}.png`,{fullPage:true,animations:'disabled'});await accessible(page);
 await expect(page.getByRole('button',{name:'2 filings'})).toHaveAttribute('aria-expanded','false');await expect(page.locator(`#filings-${sourceId}`)).toHaveCount(1);await expect(page.locator(`#filings-${sourceId}`)).toBeHidden();
 // Give the empty/wizard fixture its own rendering surface after the ready-state axe scan.
 const context=page.context();await page.close();page=await context.newPage();await page.setViewportSize({width,height:1000});state=await mock(page);state.empty=true;await page.goto(`/projects/${projectId}/data-sources`);await expect(page.getByText('No sources connected',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Connect a source',exact:true}).click();await expect(page.getByText('Not provisioned for this project.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(state.creates).toEqual([]);
 await page.getByRole('button',{name:'Connect a source',exact:true}).focus();
 await expect(page.getByRole('button',{name:'Connect a source',exact:true})).toBeFocused();
 await expect(page).toHaveScreenshot(`sources-empty-${width}.png`,{fullPage:true,animations:'disabled'});await accessible(page);
 await page.getByRole('button',{name:'Connect a source',exact:true}).click();await page.getByLabel('Source name',{exact:true}).fill('Reporting');await page.getByLabel('Secret reference',{exact:true}).fill('secret://test/reporting');
 await page.getByLabel('Verified engine',{exact:true}).selectOption(demoId);await page.getByRole('button',{name:'Test connection',exact:true}).click();await expect(page.getByText('Connection passed.',{exact:false})).toBeVisible();
 await page.getByLabel('This source receives landed spreadsheets').check();
 await expect(page).toHaveScreenshot(`sources-wizard-${width}.png`,{fullPage:true,animations:'disabled'});await accessible(page);
 await page.getByLabel('Landing strategy',{exact:true}).selectOption('table_per_filing');await page.getByLabel('returns',{exact:true}).check();
 await page.getByRole('button',{name:'Connect and introspect'}).click();await expect(page.getByText('Monthly returns',{exact:true})).toBeVisible();
 expect(state.creates).toEqual([{engineId:demoId,name:'Reporting',kind:'postgres',credentialRef:'secret://test/reporting',includeSchemas:['returns'],samplingConsent:false,receivesLandings:true,landingStrategy:'table_per_filing'}]);
});
test('O-002: loading and error can recover, viewers cannot connect, and demos require an explicit click',async({page})=>{
 const state=await mock(page);state.loading=true;await page.goto(`/projects/${projectId}/data-sources`);await expect(page.getByText('Preparing this view',{exact:true}).first()).toBeVisible();state.loading=false;await expect(page.getByText('Monthly returns',{exact:true})).toBeVisible();
 state.error=true;await page.reload();await expect(page.getByText('Sources are temporarily unavailable.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('Monthly returns',{exact:true})).toBeVisible();
 state.canConnect=false;await page.reload();await expect(page.getByRole('button',{name:'Connect a source',exact:true})).toHaveCount(0);expect(state.creates).toHaveLength(0);
 state.canConnect=true;state.prepared=true;state.empty=true;await page.reload();await expect(page.getByText('No sources connected',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Connect a source',exact:true}).click();expect(state.creates).toHaveLength(0);
 await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(page.getByText('Already connected to this project')).toBeVisible();expect(state.creates).toEqual([{demoTemplateId:demoId}]);
});

for(const width of [390,900,1440])test(`renders the persisted safe provisioning failure unchanged at ${width}`, { tag: '@visual' },async({page})=>{
 await page.setViewportSize({width,height:1000});
 const state=await mock(page);state.failure=sourceMessages.templateConflict;
 await page.goto(`/projects/${projectId}/data-sources`);
 await expect(page.getByRole('alert')).toHaveText(sourceMessages.templateConflict);
 await expect(page).toHaveScreenshot(`sources-failed-${width}.png`,{fullPage:true,animations:'disabled'});
 await accessible(page);
 await page.getByRole('region',{name:'Monthly returns',exact:true}).getByRole('button',{name:'Re-introspect',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);expect(state.retries).toEqual([{projectId}]);
});

test('source timestamps open history and failed status opens the exact failing run',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));
 const state=await mock(page);state.failure=sourceMessages.templateConflict;state.canConnect=false;
 const run={id:industryId,sourceId,state:'failed',progress:{objects:0,total:null},error:state.failure,startedAt:'2026-09-19T12:00:00.000Z',endedAt:'2026-09-19T12:00:01.000Z',diff:null};
 await page.route('**/api/v1/projects/*/**/introspections**',route=>route.fulfill({json:{items:[run],nextCursor:null}}));
 await page.route(`**/api/v1/projects/${projectId}/introspections/${industryId}`,route=>route.fulfill({json:run}));
 await page.goto(`/projects/${projectId}/data-sources`);
 const history=page.getByRole('link',{name:'Introspection runs for Monthly returns'});
 await expect(history.locator('time[data-part=timestamp]')).toHaveText('2026-09-19 12:00:00 UTC · 17 days ago');await history.focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(`/projects/${projectId}/sources/${sourceId}/introspections`);
 await expect(page.getByRole('heading',{name:'Introspection runs',exact:true})).toBeVisible();
 await page.goto(`/projects/${projectId}/data-sources`);
 await page.getByRole('link',{name:'introspection failed',exact:true}).click();
 await expect(page).toHaveURL(`/projects/${projectId}/introspections/${industryId}`);
 await expect(page.getByRole('alert')).toHaveText(sourceMessages.templateConflict);
});

for(const status of ['connected','pending','testing','unreachable','introspection_failed','archived'])test(`Re-introspect maintenance action for ${status}`,async({page})=>{
 const state=await mock(page);state.status=status;await page.goto(`/projects/${projectId}/data-sources`);
 const row=page.getByRole('region',{name:'Monthly returns',exact:true});
 const action=row.getByRole('button',{name:'Re-introspect',exact:true});
 if(status==='archived'){await expect(row).toBeVisible();await expect(action).toHaveCount(0);return;}
 await expect(action).toBeEnabled();await action.click();expect(state.retries).toEqual([{projectId}]);
});
for(const width of [390,900,1440])test(`active-run refusal names and links the run at ${width}`,{tag:'@visual'},async({page})=>{
 const state=await mock(page);state.status='pending';state.conflictRun=industryId;
 await page.setViewportSize({width,height:1000});await page.goto(`/projects/${projectId}/data-sources`);
 await page.evaluate(()=>document.fonts.ready);
 await page.getByRole('region',{name:'Monthly returns',exact:true}).getByRole('button',{name:'Re-introspect',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText(industryId);
 await expect(page.getByRole('link',{name:'View active run'})).toHaveAttribute('href',`/projects/${projectId}/introspections/${industryId}`);
 await expect(page.getByRole('region',{name:'Monthly returns',exact:true}).getByRole('alert')).toContainText(industryId);
 await expect(page.getByRole('link',{name:'View active run'})).toBeInViewport();
 await page.evaluate(()=>document.fonts.ready);await expect(page).toHaveScreenshot(`sources-active-conflict-${width}.png`,{fullPage:true});await accessible(page);
});

test('Re-introspect acknowledges before a delayed response, blocks repeat clicks, and retains a fast run receipt',async({page})=>{
 await mock(page);await page.goto(`/projects/${projectId}/data-sources`);
 const row=page.getByRole('region',{name:'Monthly returns',exact:true});
 await expect(row).toBeVisible();
 let releasePost!:()=>void,releaseRefresh!:()=>void,calls=0;
 const postGate=new Promise<void>(resolve=>{releasePost=resolve;}),refreshGate=new Promise<void>(resolve=>{releaseRefresh=resolve;});
 await page.route(`**/api/v1/sources/${sourceId}/introspect`,async route=>{calls++;await postGate;await route.fulfill({status:202,json:{...source,status:'pending',latestIntrospectionId:industryId}});});
 await page.route(`**/api/v1/projects/${projectId}/sources`,async route=>{await refreshGate;await route.fulfill({json:{items:[{...source,status:'connected',latestIntrospectionId:industryId,lastIntrospectedAt:'2026-09-19T12:00:00.400Z'}],nextCursor:null}});});
 try{
 await row.getByRole('button',{name:'Re-introspect',exact:true}).dblclick();
 await expect(row.getByRole('button',{name:'Starting…',exact:true})).toBeDisabled();expect(calls).toBe(1);
 releasePost();
 await expect(row).toContainText('pending');
 await expect(row.getByRole('button',{name:'Starting…',exact:true})).toBeDisabled();
 releaseRefresh();await expect(row.getByRole('button',{name:'Re-introspect',exact:true})).toBeEnabled();
 await expect(row.getByRole('link',{name:'View started run'})).toHaveAttribute('href',`/projects/${projectId}/introspections/${industryId}`);
 await expect(row.getByRole('status')).toContainText('Introspection started.');expect(calls).toBe(1);
 }finally{releasePost();releaseRefresh();}
});

test('Landing strategy remains a single left-aligned label with a long demo source name',async({page})=>{
 await mock(page);await page.route(`**/api/v1/projects/${projectId}/sources`,route=>route.fulfill({json:{items:[{...source,name:'demo_f41a390104a447fe8aaa0ccad1c643f1',exposedAlias:'demo_f41a390104a447fe8aaa0ccad1c643f1'}],nextCursor:null}}));
 await page.setViewportSize({width:1440,height:1000});await page.goto(`/projects/${projectId}/data-sources`);
 const label=page.getByText('append as at',{exact:true});await expect(label).toBeVisible();
 expect(await label.evaluate(el=>({wrap:getComputedStyle(el).whiteSpace,align:getComputedStyle(el).textAlign,lines:el.getClientRects().length}))).toEqual({wrap:'nowrap',align:'left',lines:1});
});

for(const timezone of ['UTC','America/Toronto'])test(`Last introspected uses shared Timestamp at 390 in ${timezone}`,async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));await mock(page);
 await page.route('**/api/v1/me/settings',route=>route.fulfill({json:{email:'admin@example.com',fullName:'Admin',timezone,dateFormat:'YYYY-MM-DD',reducedMotion:true}}));
 await page.setViewportSize({width:390,height:1000});await page.goto(`/projects/${projectId}/data-sources`);
 const link=page.getByRole('link',{name:'Introspection runs for Monthly returns'}),timestamp=link.locator('time[data-part="timestamp"]');
 await expect(link).toHaveAttribute('href',`/projects/${projectId}/sources/${sourceId}/introspections`);
 await expect(timestamp).toHaveAttribute('datetime',source.lastIntrospectedAt);
 await expect(timestamp.locator('[data-part="absolute"]')).toHaveText(timezone==='UTC'?'2026-09-19 12:00:00 UTC':'2026-09-19 08:00:00 EDT');
 await expect(timestamp.locator('[data-part="relative"]')).toHaveText('17 days ago');
 const parts=await timestamp.evaluate(el=>[...el.children].map(part=>({lines:part.getClientRects().length,whiteSpace:getComputedStyle(part).whiteSpace})));
 for(const part of parts){expect(part.lines).toBe(1);expect(part.whiteSpace).toBe('nowrap');}
 await accessible(page);
});
