import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
const project='018f8f9d-7f83-7abc-8def-000000000001',source='018f8f9d-7f83-7abc-8def-000000000002',run='018f8f9d-7f83-7abc-8def-000000000003';
async function mock(page:Page){
 const state={empty:false,error:false,loading:false};
 await page.route('**/api/v1/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.endsWith('/auth/me'))return route.fulfill({json:{id:run,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00Z',deviceConfirmed:true}});
 if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id:run,name:'Example'},industry:{id:run,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
 if(path.endsWith('/filings'))return route.fulfill({json:{items:[],nextCursor:null}});
 if(path.endsWith('/token-key'))return route.fulfill({json:{currentVersion:null,versions:[]}});
 if(path.endsWith('/custody-observations'))return route.fulfill({json:{items:[],counts:{open:0,resolved:0},nextCursor:null}});
 if(path.endsWith('/observations')){
 if(state.loading)await new Promise(resolve=>setTimeout(resolve,1500));
 if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Source type findings are unavailable.',requestId:'test',retryable:true}}});
 return route.fulfill({json:{items:state.empty?[]:[{id:'type:unmapped:inet',kind:'type',cause:'unmapped',causeDetail:'inet',state:'open',count:2,oldestAt:'2026-09-30T12:00:00Z',latestAt:'2026-09-30T12:00:00Z'}],counts:{open:state.empty?0:2,resolved:0},nextCursor:null}});
 }
 if(path.endsWith('/observations/members'))return route.fulfill({json:{items:[{id:source,kind:'type',state:'open',observedAt:'2026-09-30T12:00:00Z',resolvedAt:null,resolution:null,metadata:{sourceId:source,sourceName:'Warehouse',sourceType:'inet',object:'records',column:'address',elementId:source,runId:run},history:[{at:'2026-09-30T12:00:00Z',state:'open',cause:'unmapped',resolution:null}]}],nextCursor:null}});
 return route.fulfill({status:404,json:{}});
 });return state;
}
for(const width of [390,900,1440])test(`unmapped source observation at ${width}`,{tag:'@visual'},async({page})=>{
 await mock(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/observations`);
 // Finish the entrance transform before clicking: focus can scroll the clipped card.
 await page.locator('.screen.on').evaluate(async el=>{await document.fonts.ready;await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished));});
 await page.getByRole('button',{name:'Details',exact:true}).click();await expect(page.getByText('Warehouse',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'A source type has no mapping: inet',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'View introspection'})).toHaveAttribute('href',`/projects/${project}/introspections/${run}`);
 // Wait for exact card/header geometry and scroll position, without a pixel tolerance.
 await page.locator('article[data-layout="observation"]').evaluate(async el=>{
  await document.fonts.ready;
  await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished));
  let previous='',stable=0;
  for(let frame=0;frame<120;frame++){
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   const rect=el.getBoundingClientRect(),header=el.querySelector('.card-h')?.getBoundingClientRect();
   const current=JSON.stringify([rect.width,rect.height,header?.height,el.scrollLeft,el.scrollHeight]);
   stable=current===previous?stable+1:0;previous=current;
   if(stable===3)return;
  }
  throw new Error('Observation disclosure layout did not settle.');
 });await page.evaluate(()=>window.scrollTo(0,0));await expect(page).toHaveScreenshot(`type-observation-${width}.png`,{fullPage:true});
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('type observations load, recover from error and omit the empty card',async({page})=>{
 const state=await mock(page);state.loading=true;await page.goto(`/projects/${project}/observations`);await expect(page.getByText('Preparing this view').first()).toBeVisible();await page.getByRole('button',{name:'Details',exact:true}).click();await expect(page.getByText('Warehouse',{exact:true})).toBeVisible();
 state.loading=false;state.error=true;await page.reload();await expect(page.getByText('Source type findings are unavailable.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('button',{name:'Details',exact:true}).click();await expect(page.getByText('Warehouse',{exact:true})).toBeVisible();
 state.empty=true;await page.reload();await expect(page.getByText('Nothing needs attention.',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Unmapped source types'})).toHaveCount(0);
});

for(const timezone of ['UTC','America/Toronto'])test(`type Observation disclosure stays inside its card at 390 in ${timezone}`,async({page},testInfo)=>{
 await mock(page);
 await page.route('**/api/v1/auth/me',route=>route.fulfill({json:{id:run,email:'admin@example.com',fullName:'Admin',timezone,method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00Z',deviceConfirmed:true}}));
 await page.setViewportSize({width:390,height:1000});await page.goto(`/projects/${project}/observations`);
 const card=page.locator('article[data-layout="observation"]');
 const assertFits=async()=>{
  const geometry=await card.evaluate(el=>{const bounds=el.getBoundingClientRect();return {clientWidth:el.clientWidth,border:el.clientLeft,scrollWidth:el.scrollWidth,scrollLeft:el.scrollLeft,timestamps:[...el.querySelectorAll('time')].filter(t=>t.getClientRects().length>0).map(t=>({text:t.textContent,parts:[...t.querySelectorAll('span')].map(part=>{const rect=part.getBoundingClientRect();return {left:rect.left-bounds.left,right:rect.right-bounds.left,lines:part.getClientRects().length};})}))};});
  await testInfo.attach('observation-card-geometry',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);expect(geometry.scrollLeft).toBe(0);
  for(const timestamp of geometry.timestamps)for(const part of timestamp.parts){expect(part.lines).toBe(1);expect(part.left).toBeGreaterThanOrEqual(geometry.border);expect(part.right).toBeLessThanOrEqual(geometry.border+geometry.clientWidth);}
 };
 await page.getByRole('button',{name:'Details',exact:true}).click();await expect(page.getByText('Warehouse',{exact:true})).toBeVisible();await assertFits();
 await page.getByRole('link',{name:'View introspection'}).focus();await assertFits();
 await page.getByRole('button',{name:'History',exact:true}).click();await assertFits();
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
