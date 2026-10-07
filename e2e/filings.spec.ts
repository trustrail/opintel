import {dashboard as dashboardFixture} from './dashboard-fixture.js';
import {test} from './fixtures.js';
import { expect, type Page } from '@playwright/test';
import axe from 'axe-core';
test.use({ reducedMotion: 'reduce' });
const projectId='018f8f9d-7f83-7abc-8def-000000000001';
const sourceId='018f8f9d-7f83-7abc-8def-000000000002';
const otherId='018f8f9d-7f83-7abc-8def-000000000003';
const prior='018f8f9d-7f83-7abc-8def-000000000004';
const current='018f8f9d-7f83-7abc-8def-000000000005';
const held='018f8f9d-7f83-7abc-8def-000000000006';
const source={id:sourceId,name:'Monthly returns',exposedAlias:'monthly_returns',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:'append_as_at',filingCount:2,elementCount:7,unsupportedCount:0,undecidedCount:7,latestIntrospectionId:null,lastIntrospectedAt:null};
const filing={filingId:prior,sourceId,partyCode:'4471',kind:'monthly return',period:'2026-03',outcome:'landed',quarantineCategory:null,supersedes:null,rowCount:318,receivedAt:'2026-04-01T12:00:00Z',revision:2};
async function mock(page:Page){
 const state={strategy:'append_as_at',category:'verification_mismatch',empty:false,error:false,loading:false,cursors:[] as string[]};
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id:otherId,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:projectId,name:'Reporting',company:{id:otherId,name:'Example Company'},industry:{id:otherId,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
  if(path.endsWith('/stats'))return route.fulfill({json:{...dashboardFixture,pools:0,sources:0}});
  if(path.endsWith('/dashboard/pools'))return route.fulfill({json:{items:[],nextCursor:null}});
  if(path.endsWith('/dashboard/feed'))return route.fulfill({json:{items:state.empty?[]:[{id:'quarantine:'+held,kind:'quarantine',filingId:held,zoneId:sourceId,category:'verification_mismatch',receivedAt:'2026-04-01T12:00:00Z'}],nextCursor:null}});
  if(path.endsWith('/type-observations'))return route.fulfill({json:{items:[],nextCursor:null}});
  if(path.endsWith('/custody-observations'))return route.fulfill({json:{items:[],counts:{open:0,resolved:0},nextCursor:null}});
  if(path.endsWith('/observations')){
   if(state.loading)await new Promise(resolve=>setTimeout(resolve,1500));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'The filing register is temporarily unavailable.',requestId:'filings-test',retryable:true}}});
   return route.fulfill({json:{items:state.empty?[]:[{id:'filing:'+state.category+':',kind:'filing',cause:state.category,causeDetail:'',state:'open',count:1,oldestAt:filing.receivedAt,latestAt:filing.receivedAt}],counts:{open:state.empty?0:1,resolved:0},nextCursor:null}});
  }
  if(path.endsWith('/observations/members'))return route.fulfill({json:{items:[{id:held,kind:'filing',state:'open',observedAt:filing.receivedAt,resolvedAt:null,resolution:null,metadata:{filingId:held,zoneId:sourceId,sourceName:source.name,engineId:null,engineName:null},history:[{at:filing.receivedAt,state:'open',cause:state.category,resolution:null}]}],nextCursor:null}});
  if(path.endsWith('/token-key'))return route.fulfill({json:{currentVersion:null,versions:[]}});
  if(path.endsWith('/demo-sources'))return route.fulfill({json:[]});
  if(path.endsWith('/sources'))return route.fulfill({json:{items:[{...source,landingStrategy:state.strategy},{...source,id:otherId,name:'Live database',exposedAlias:'live_database',landingStrategy:null,filingCount:null}],nextCursor:null}});
  if(path.endsWith('/filings')){
   if(state.loading)await new Promise(resolve=>setTimeout(resolve,1500));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'The filing register is temporarily unavailable.',requestId:'filings-test',retryable:true}}});
   if(state.empty)return route.fulfill({json:{items:[],nextCursor:null}});
   const cursor=url.searchParams.get('cursor');if(cursor)state.cursors.push(cursor);
   return route.fulfill({json:cursor?{items:[{...filing,filingId:current,supersedes:prior,rowCount:320,receivedAt:'2026-04-02T12:00:00Z'},{...filing,filingId:held,outcome:'quarantined',quarantineCategory:state.category,rowCount:null}],nextCursor:null}:{items:[filing,{...filing,filingId:otherId,sourceId:otherId,partyCode:'OTHER-SOURCE'}],nextCursor:'next-page'}});
  }
  return route.fulfill({status:404,json:{}});
 });return state;
}
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
for(const width of [390,900,1440])test(`ING-27/29: source filings and quarantine surfaces at ${width}`, { tag: '@visual' },async({page:initialPage})=>{
 test.setTimeout(60_000); // Three screens, screenshots and axe scans in one browser flow.
 let page=initialPage;
 const state=await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${projectId}/data-sources`);
 await expect(page.getByRole('link',{name:'Introspection runs for Monthly returns'})).toHaveText('Runs');
 const pill=page.getByRole('button',{name:'2 filings'});await expect(pill).toHaveAttribute('aria-expanded','false');
 await expect(page.getByRole('row').filter({hasText:'Live database'}).getByRole('button',{name:/filing/})).toHaveCount(0);
 await pill.click();const detail=page.getByRole('region',{name:'Recent filings into this source'});
 await expect(detail.getByText('Restatement',{exact:true})).toBeVisible();await expect(detail.getByText(current,{exact:true})).toBeVisible();expect(state.cursors).toContain('next-page');
 await expect(detail.getByText(held,{exact:true})).toHaveCount(0);await expect(detail.getByText('OTHER-SOURCE',{exact:true})).toHaveCount(0);
 await expect(detail.locator('tbody tr').first()).toContainText(current);await expect(detail).toContainText('both versions stay queryable');
 await expect(page).toHaveScreenshot(`filings-expanded-${width}.png`,{fullPage:true});await accessible(page);
 await pill.click();await expect(detail).toHaveCount(0);
 await pill.focus();await page.keyboard.press('Enter');await expect(detail).toBeVisible();await pill.focus();await page.keyboard.press('Space');await expect(detail).toHaveCount(0);
 // Start feed snapshots in a fresh page after the keyboard interaction above.
 await page.close();page=await initialPage.context().newPage();await mock(page);await page.setViewportSize({width,height:1000});
 await page.goto(`/projects/${projectId}/dashboard`);await expect(page.getByText(held,{exact:true})).toBeVisible();await expect(page.getByText(current,{exact:true})).toHaveCount(0);
 await expect(page.getByText('The content does not match the attributed filing party.',{exact:true})).toBeVisible();await expect(page.getByText("Nothing landed, so this filing's data is not in the catalogue.",{exact:true})).toBeVisible();await expect(page.getByText(sourceId,{exact:true})).toHaveCSS('user-select','all');await expect(page.getByText(held,{exact:true})).toHaveCSS('user-select','all');await expect(page.getByText(/npm run sidecar:register --/)).toHaveCount(0);
 await expect(page).toHaveScreenshot(`filings-dashboard-${width}.png`,{fullPage:true});await accessible(page);
 await page.goto(`/projects/${projectId}/observations`);await page.getByRole('button',{name:'Details',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByText(held,{exact:true})).toBeVisible();await expect(page.getByText('The full reason stays in the customer environment because it may contain file contents.',{exact:true})).toBeVisible();await expect(page.getByText(sourceId,{exact:true})).toHaveCSS('user-select','all');
 await expect(page).toHaveScreenshot(`filings-observations-${width}.png`,{fullPage:true});
 await accessible(page);
});
test('ING-29: loading, empty and error states recover without exposing local details',async({page})=>{
 test.setTimeout(60_000); // Multiple reloads and error recovery on two screens.
 const state=await mock(page);state.loading=true;await page.goto(`/projects/${projectId}/observations`);await expect(page.getByText('Preparing this view',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Details',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByText(held,{exact:true})).toBeVisible();state.loading=false;
 state.error=true;await page.reload();await expect(page.getByText('The filing register is temporarily unavailable.',{exact:true})).toBeVisible();state.error=false;state.empty=true;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('Nothing needs attention.',{exact:true})).toBeVisible();
 await page.goto(`/projects/${projectId}/data-sources`);await page.getByRole('button',{name:'2 filings'}).click();await expect(page.getByText('No landed filings yet',{exact:true})).toBeVisible();
 state.error=true;await page.reload();await page.getByRole('button',{name:'2 filings'}).click();await expect(page.getByText('The filing register is temporarily unavailable.',{exact:true})).toBeVisible();state.error=false;state.empty=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('Restatement',{exact:true})).toBeVisible();
});

test('ING-27: table-per-filing strategy and reader-facing quarantine resolution',async({page})=>{
 test.setTimeout(60_000); // Source detail, observations and two category changes.
 const state=await mock(page);state.strategy='table_per_filing';await page.goto(`/projects/${projectId}/data-sources`);await page.getByRole('button',{name:'2 filings'}).click();
 await expect(page.getByText('Under table per filing, each filing lands in its own table.',{exact:false})).toBeVisible();await expect(page.getByText('Restatement',{exact:true})).toBeVisible();
 await page.goto(`/projects/${projectId}/observations`);await page.getByRole('button',{name:'Details',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();
 await expect(page.getByText('No filing-party rule matched.',{exact:true})).toHaveCount(0);
 await expect(page.getByText('The content does not match the attributed filing party.',{exact:true})).toBeVisible();
 await expect(page.getByText("Nothing landed, so this data is not in the catalogue.",{exact:true})).toBeVisible();
 await expect(page.getByText('The full reason stays in the customer environment because it may contain file contents.',{exact:true})).toBeVisible();
 await expect(page.getByText(sourceId,{exact:true})).toHaveCSS('user-select','all');await expect(page.getByText(held,{exact:true})).toHaveCSS('user-select','all');await expect(page.getByText(/npm run sidecar:register --/)).toHaveCount(0);await accessible(page);
 await expect(page.getByText('Resolved by whoever operates the Opintel Engine.',{exact:true})).toBeVisible();
 for(const [category,sentence] of [['no_rule_matched','No filing-party rule matched.'],['merged_header','The header contains merged cells.']] as const){
  state.category=category;await page.reload();await page.getByRole('button',{name:'Details',exact:true}).click();await expect(page.getByText(sentence,{exact:true})).toBeVisible();
  await expect(page.getByText(/Nothing landed,.*data is not in the catalogue\./)).toBeVisible();
 }
});

for(const width of [390,900,1440])test(`TOK-28: custody observations at ${width}`, { tag: '@visual' },async({page})=>{
 const state=await mock(page);state.empty=true;
 const causes=['custody_failed','custody_mismatch'] as const;
 await page.route('**/api/v1/projects/*/custody-observations',route=>route.fulfill({json:{items:causes.map(cause=>({id:'custody:'+cause+':',kind:'custody',cause,causeDetail:'',state:'open',count:1,oldestAt:'2026-09-22T12:00:00Z',latestAt:'2026-09-22T12:00:00Z'})),counts:{open:2,resolved:0},nextCursor:null}}));
 await page.route('**/api/v1/projects/*/custody-observations/members*',route=>{const mismatch=new URL(route.request().url()).searchParams.get('group')?.includes('mismatch');return route.fulfill({json:{items:[{id:mismatch?'1':'2',kind:'custody',state:'open',observedAt:'2026-09-22T12:00:00Z',resolvedAt:null,resolution:null,metadata:{keyVersion:mismatch?1:2,keyState:mismatch?'retired':'current'},history:[{at:'2026-09-22T12:00:00Z',state:'open',cause:mismatch?'custody_mismatch':'custody_failed',resolution:null}]}],nextCursor:null}});});
 await page.setViewportSize({width,height:1000});await page.goto(`/projects/${projectId}/observations`);
 await expect(page.getByRole('heading',{name:'Escrow could not be verified',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Escrow does not match the recorded key',exact:true})).toBeVisible();
 for(const button of await page.getByRole('button',{name:'Details',exact:true}).all())await button.click();
 await expect(page.getByText('Key version 2',{exact:true})).toBeVisible();await expect(page.getByText('Key version 1',{exact:true})).toBeVisible();
 await expect(page.getByText('This retained key is needed to verify earlier evidence.',{exact:false})).toBeVisible();
 await expect(page).toHaveScreenshot(`custody-observations-${width}.png`,{fullPage:true});await accessible(page);
});
