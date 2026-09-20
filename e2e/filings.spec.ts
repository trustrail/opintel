import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
test.use({ reducedMotion: 'reduce' });
const projectId='018f8f9d-7f83-7abc-8def-000000000001';
const sourceId='018f8f9d-7f83-7abc-8def-000000000002';
const otherId='018f8f9d-7f83-7abc-8def-000000000003';
const prior='018f8f9d-7f83-7abc-8def-000000000004';
const current='018f8f9d-7f83-7abc-8def-000000000005';
const held='018f8f9d-7f83-7abc-8def-000000000006';
const source={id:sourceId,name:'Monthly returns',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:'append_as_at',filingCount:2,elementCount:7,undecidedCount:7,lastIntrospectedAt:null};
const filing={filingId:prior,sourceId,partyCode:'4471',kind:'monthly return',period:'2026-03',outcome:'landed',quarantineCategory:null,supersedes:null,rowCount:318,receivedAt:'2026-04-01T12:00:00Z',revision:2};
async function mock(page:Page){
 const state={strategy:'append_as_at',empty:false,error:false,loading:false,cursors:[] as string[]};
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id:otherId,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
  if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:projectId,name:'Reporting',company:{id:otherId,name:'Example Company'},industry:{id:otherId,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
  if(path.endsWith('/demo-sources'))return route.fulfill({json:[]});
  if(path.endsWith('/sources'))return route.fulfill({json:{items:[{...source,landingStrategy:state.strategy},{...source,id:otherId,name:'Live database',landingStrategy:null,filingCount:null}],nextCursor:null}});
  if(path.endsWith('/filings')){
   if(state.loading)await new Promise(resolve=>setTimeout(resolve,1500));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'The filing register is temporarily unavailable.',requestId:'filings-test',retryable:true}}});
   if(state.empty)return route.fulfill({json:{items:[],nextCursor:null}});
   const cursor=url.searchParams.get('cursor');if(cursor)state.cursors.push(cursor);
   return route.fulfill({json:cursor?{items:[{...filing,filingId:current,supersedes:prior,rowCount:320,receivedAt:'2026-04-02T12:00:00Z'},{...filing,filingId:held,outcome:'quarantined',quarantineCategory:'verification_mismatch',rowCount:null}],nextCursor:null}:{items:[filing,{...filing,filingId:otherId,sourceId:otherId,partyCode:'OTHER-SOURCE'}],nextCursor:'next-page'}});
  }
  return route.fulfill({status:404,json:{}});
 });return state;
}
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
for(const width of [390,900,1440])test(`ING-27/29: source filings and quarantine surfaces at ${width}`,async({page})=>{
 const state=await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${projectId}/data-sources`);
 const pill=page.getByRole('button',{name:'2 filings'});await expect(pill).toHaveAttribute('aria-expanded','false');
 await expect(page.getByRole('row').filter({hasText:'Live database'}).getByRole('button')).toHaveCount(0);
 await pill.click();const detail=page.getByRole('region',{name:'Recent filings into this source'});
 await expect(detail.getByText('Restatement',{exact:true})).toBeVisible();await expect(detail.getByText(current,{exact:true})).toBeVisible();expect(state.cursors).toContain('next-page');
 await expect(detail.getByText(held,{exact:true})).toHaveCount(0);await expect(detail.getByText('OTHER-SOURCE',{exact:true})).toHaveCount(0);
 await expect(detail.locator('tbody tr').first()).toContainText(current);await expect(detail).toContainText('both versions stay queryable');
 await expect(page).toHaveScreenshot(`filings-expanded-${width}.png`,{fullPage:true});await accessible(page);
 await pill.click();await expect(detail).toHaveCount(0);
 await pill.focus();await page.keyboard.press('Enter');await expect(detail).toBeVisible();await pill.focus();await page.keyboard.press('Space');await expect(detail).toHaveCount(0);
 await page.goto(`/projects/${projectId}/dashboard`);await expect(page.getByText(held,{exact:true})).toBeVisible();await expect(page.getByText(current,{exact:true})).toHaveCount(0);
 await expect(page.getByText('The content does not match the attributed filing party.',{exact:true})).toBeVisible();await expect(page.getByText('A filing landed against the wrong party is worse than one that did not land.',{exact:false})).toBeVisible();
 await expect(page).toHaveScreenshot(`filings-dashboard-${width}.png`,{fullPage:true});await accessible(page);
 await page.goto(`/projects/${projectId}/observations`);await expect(page.getByText(held,{exact:true})).toBeVisible();await expect(page.getByText('Attribution is checked again; it cannot be overridden.',{exact:false})).toBeVisible();
 await expect(page).toHaveScreenshot(`filings-observations-${width}.png`,{fullPage:true});await accessible(page);
});
test('ING-29: loading, empty and error states recover without exposing local details',async({page})=>{
 const state=await mock(page);state.loading=true;await page.goto(`/projects/${projectId}/observations`);await expect(page.getByText('Preparing this view',{exact:true})).toBeVisible();await expect(page.getByText(held,{exact:true})).toBeVisible();state.loading=false;
 state.error=true;await page.reload();await expect(page.getByText('The filing register is temporarily unavailable.',{exact:true})).toBeVisible();state.error=false;state.empty=true;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('No quarantined filings',{exact:true})).toBeVisible();
 await page.goto(`/projects/${projectId}/data-sources`);await page.getByRole('button',{name:'2 filings'}).click();await expect(page.getByText('No landed filings yet',{exact:true})).toBeVisible();
 state.error=true;await page.reload();await page.getByRole('button',{name:'2 filings'}).click();await expect(page.getByText('The filing register is temporarily unavailable.',{exact:true})).toBeVisible();state.error=false;state.empty=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('Restatement',{exact:true})).toBeVisible();
});

test('ING-27: table-per-filing strategy and local quarantine resolution',async({page})=>{
 const state=await mock(page);state.strategy='table_per_filing';await page.goto(`/projects/${projectId}/data-sources`);await page.getByRole('button',{name:'2 filings'}).click();
 await expect(page.getByText('Under table per filing, each filing lands in its own table.',{exact:false})).toBeVisible();await expect(page.getByText('Restatement',{exact:true})).toBeVisible();
 await page.goto(`/projects/${projectId}/observations`);await page.getByText('Local resolution instructions',{exact:true}).click();
 await expect(page.getByText(`npm run sidecar:register -- show ${sourceId} ${held}`,{exact:true})).toBeVisible();await expect(page.getByText(`npm run sidecar:register -- retry ${sourceId} ${held}`,{exact:true})).toBeVisible();await accessible(page);
});
