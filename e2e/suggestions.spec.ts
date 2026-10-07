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
 const column=(elementId:string,object:string):Suggestion['left']=>({id:elementId,name:`reinsurance.public.${object}.treaty`,active:true,address:{sourceId:source,sourceName:'Reinsurance',alias:'reinsurance',schema:'public',object,column:'treaty'},exposedType:'VARCHAR',treatments:[{poolId:pool,poolName:'Reporting pool',treatment:'tokenized'}],domain:{declared:null,effective:'opintelisolated'+elementId.replaceAll('-',''),provenance:'element_identity',memberCount:1}});
 const item:Suggestion={id,left:column(source,'premium'),right:column(pool,'claim'),trend:Array.from({length:7},(_,i)=>({day:new Date(Date.UTC(2026,8,30+i)).toISOString().slice(0,10),queries:i===5?2:0,explains:i===5?3:0})),queries:2,explains:3,latestAt:'2026-10-05 12:00 UTC',latestAttemptId:id,agents:['reporting-agent'],pools:[{id:pool,name:'Reporting pool'}],confirmationBlocked:null,status:'pending',raisedAgain:false,history:[]};
 const state={items:[item],error:false,loading:false};
 await page.route('**/api/v1/projects/*/suggestions**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/domains'))return route.fulfill({json:{items:[{domain:'treaty',members:[{elementId:source,name:'reinsurance.public.contract.identifier',objectLabel:'contract',columnName:'identifier',version:1}]}],nextCursor:null}});
  if(path.endsWith('/attempts'))return route.fulfill({json:{items:[{id,operation:'explain',at:item.latestAt,agentId:'reporting-agent',statement:null,argumentVisibility:'hidden'}],nextCursor:null}});
  if(path.endsWith('/decisions')){const body=route.request().postDataJSON() as {action:'confirm'|'reject'|'not_sure';domain?:string};item.status=body.action;item.history.push({id,action:body.action,actorId:source,actorName:'Admin',at:item.latestAt,domain:body.domain??null,assignments:body.action==='confirm'?[{elementId:source,version:2}]:[]});return route.fulfill({json:{recorded:true}});}
  if(state.loading)await new Promise(r=>setTimeout(r,1500));
  return state.error?route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Suggestions unavailable',requestId:id,retryable:true}}}):route.fulfill({json:{items:state.items.filter(i=>new URL(route.request().url()).searchParams.get('view')==='reviewed'?i.status==='confirm'||i.status==='reject':i.status==='pending'||i.status==='not_sure'),nextCursor:null,projectName:'Reporting'}});
 });return {state,item,dashboard};
}
const path=`/projects/${project}/relationship-suggestions`;
test('SUG-006: drawer, explicit membership choice, confirmation and retained history',async({page})=>{
 await setup(page);await page.goto(path);
 await expect(page.getByRole('link',{name:'Suggestions',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
 await expect(page.getByText('contract.identifier',{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'What this changes'})).toHaveCount(0);await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);
 await page.getByRole('radio',{name:/Join the treaty domain/}).check();await page.getByLabel('Type project name: Reporting').fill('Reporting');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Decision recorded.'})).toContainText('Decision recorded.');await expect(page.getByRole('article')).toHaveCount(0);await page.getByRole('button',{name:'Reviewed',exact:true}).click();await expect(page.getByRole('button',{name:'Not sure',exact:true})).toHaveCount(0);
 await page.getByText('Decision and assignment history (1)').click();await expect(page.getByText(/Confirmed by Admin/)).toBeVisible();await expect(page.getByText(/assignment version 2/)).toBeVisible();await page.getByRole('button',{name:'Attempts and SQL',exact:true}).click();await expect(page.getByText('SQL hidden by Activity permissions or redaction policy.')).toBeVisible();
 await accessible(page);
});
test('SUG-004/006: clear candidates block confirmation; not sure stays visible and rises on later attempt',async({page})=>{
 const {item}=await setup(page);item.confirmationBlocked='Change the clear entitlement to tokenized first.';await page.goto(path);
 await expect(page.getByRole('button',{name:'Confirm',exact:true})).toHaveCount(0);item.left.treatments[0]!.treatment='clear';await page.reload();await expect(page.getByRole('link',{name:/Open entitlements for/})).toBeVisible();
 await page.getByRole('button',{name:'Not sure',exact:true}).click();await expect(page.getByText('Decision and assignment history (1)')).toBeVisible();
 item.raisedAgain=true;item.explains++;await page.reload();await expect(page.getByText('A later attempt raised this deferred suggestion again.')).toBeVisible();
 await accessible(page);
});
test('SUG-006: loading, empty, error and viewer states',async({page})=>{
 const {state,dashboard,item}=await setup(page);state.loading=true;await page.goto(path);await expect(page.getByText('Preparing this view').first()).toBeVisible();await expect(page.getByRole('article',{name:/reinsurance.public.premium/})).toBeVisible();
 state.loading=false;state.items=[];await page.reload();await expect(page.getByText('No open join suggestions')).toBeVisible();
 state.error=true;await page.reload();await expect(page.getByText('Suggestions could not be loaded')).toBeVisible();
 state.error=false;state.items=[item];dashboard.admin=false;await page.reload();await expect(page.getByText('Read-only. A project administrator reviews suggestions.')).toBeVisible();await expect(page.getByRole('button',{name:'Not sure',exact:true})).toBeDisabled();
 await accessible(page);
});
test('SUG-003/006: a new shared domain is an explicit choice',async({page})=>{await setup(page);await page.goto(path);await page.getByRole('radio',{name:'Start a new domain'}).check();await page.getByLabel('New shared domain').fill('newtreaty');await page.getByLabel('Type project name: Reporting').fill('Reporting');await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Decision recorded.'})).toContainText('Decision recorded.');await expect(page.getByRole('article')).toHaveCount(0);await page.getByRole('button',{name:'Reviewed',exact:true}).click();await expect(page.getByRole('button',{name:'Not sure',exact:true})).toHaveCount(0);await page.getByText('Decision and assignment history (1)').click();await expect(page.getByText(/Shared domain: newtreaty/)).toBeVisible();});
for(const width of [390,900,1440])test(`@visual SUG-006: suggestion review ${width}`,async({page})=>{await setup(page);await page.setViewportSize({width,height:1000});await page.goto(path);await expect(page.getByRole('radio',{name:/Join the treaty domain/})).toBeVisible();await expect(page).toHaveScreenshot(`suggestions-${width}.png`,{fullPage:true});});


test('RED-010: blocked suggestion opens the exact pool and element without selecting it',async({page})=>{
 const {item}=await setup(page);item.confirmationBlocked='Change the clear entitlement to tokenized first.';item.left.treatments[0]!.treatment='clear';
 const reads:URL[]=[];
 await page.route('**/api/v1/projects/*/pools',r=>r.fulfill({json:{items:[{id:pool,name:'Reporting pool',sourceIds:[source]}],nextCursor:null}}));
 await page.route('**/api/v1/projects/*/sources',r=>r.fulfill({json:{items:[{id:source,name:'Reinsurance',exposedAlias:'reinsurance',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:null,filingCount:null,elementCount:2,unsupportedCount:0,undecidedCount:0,latestIntrospectionId:null,lastIntrospectedAt:null}],nextCursor:null}}));
 await page.route('**/api/v1/pools/*/entitlement-*',async r=>{
 const url=new URL(r.request().url());reads.push(url);const counts=[{value:'clear',count:1}];
 if(url.pathname.endsWith('/entitlement-groups'))return r.fulfill({json:{items:[{groupKey:'name:treaty',name:'treaty',count:1,objects:1,types:[{value:'VARCHAR',count:1}],decisions:counts,queries:2,explains:3}],totals:{members:1,groups:1,undecided:0,decisions:counts},nextCursor:null}});
 return r.fulfill({json:{items:[{id:source,group:'name:treaty',name:'treaty',qualifiedName:item.left.name,objectId:id,objectName:'reinsurance.public.premium',objectLabel:'premium',sourceId:source,exposedType:'VARCHAR',sourceType:'text',treatment:'clear',maskKind:null,justification:'Reporting'}],nextCursor:null}});
 });
 await page.goto(path);await page.getByRole('link',{name:/Open entitlements for/}).click();await expect(page).toHaveURL(new RegExp(`entitlements.*elementId=${source}`));
 await expect(page.getByRole('link',{name:`Declarations for ${item.left.name}`})).toBeVisible();await expect(page.getByRole('checkbox',{name:`Select ${item.left.name}`})).not.toBeChecked();
 expect(reads.length).toBeGreaterThan(1);expect(reads.every(u=>u.searchParams.get('elementId')===source&&u.pathname.includes(pool)&&u.searchParams.get('decision')==='all')).toBe(true);
 await page.getByRole('button',{name:'Hide members',exact:true}).click();await expect(page.getByRole('link',{name:`Declarations for ${item.left.name}`})).toBeHidden();
 await page.getByRole('button',{name:'By table',exact:true}).click();await expect(page.getByRole('link',{name:`Declarations for ${item.left.name}`})).toBeVisible();await expect(page.getByRole('checkbox',{name:`Select ${item.left.name}`})).not.toBeChecked();expect(reads.at(-1)?.searchParams.get('elementId')).toBe(source);await accessible(page);
});

for(const width of [390,900,1440])test(`RED-009/011: measured Suggestions design and accessible controls ${width}`,async({page},testInfo)=>{
 await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));const {item}=await setup(page);
 item.right.domain={declared:'treaty',effective:'treaty',provenance:'declared',memberCount:11};
 await page.setViewportSize({width,height:1000});await page.goto(path);await expect(page.getByRole('radio',{name:/Join the treaty domain/})).toBeVisible();await page.getByRole('radio',{name:/Join the treaty domain/}).check();await page.evaluate(()=>document.fonts.ready);
 await expect(page.getByText('Join attempted',{exact:true})).toBeVisible();await expect(page.getByText('Last 7 days (UTC)',{exact:true})).toBeVisible();await expect(page.getByText('Isolated — joins only this element')).toBeVisible();
 const measured=await page.locator('article[data-layout="suggestion"]').evaluate(card=>{
 const read=(selector:string)=>{const node=card.querySelector(selector)!;const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {width:r.width,height:r.height,x:r.x,y:r.y,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight};};
  const host=card.closest('.body')!,hostStyle=getComputedStyle(host);
 return {pageWidth:host.getBoundingClientRect().width,pagePadding:[hostStyle.paddingTop,hostStyle.paddingRight,hostStyle.paddingBottom,hostStyle.paddingLeft],pair:read('[data-layout="pair"]'),demand:read('[data-part="demand"]'),body:read('.sheetb'),choices:read('.scopepick'),choice:read('.opt'),choiceLabel:read('.opt b'),columnName:read('[data-part="column-name"]'),columnAddress:read('[data-part="column-address"]'),question:read('[data-part="question"]'),consequence:read('.effect'),confirmation:read('[data-part="confirmation"]'),footer:read('.sheetf'),pairColumns:getComputedStyle(card.querySelector('[data-layout="pair"]')!).gridTemplateColumns};
 });
 console.log('Suggestions measurements',width,JSON.stringify(measured));await testInfo.attach('suggestions-measurements',{body:JSON.stringify({width,...measured},null,2),contentType:'application/json'});
 expect(measured.pageWidth).toBeLessThanOrEqual(1180);expect(measured.pagePadding).toEqual(['20px','26px','44px','26px']);expect(measured.columnName.fontSize).toBe('16px');expect(measured.columnName.fontWeight).toBe('650');expect(measured.choiceLabel.fontSize).toBe('13.5px');expect(measured.choiceLabel.fontWeight).toBe('600');await expect(page.getByRole('combobox')).toHaveCount(0);
 if(width>900)expect(measured.pairColumns.split(' ')).toHaveLength(3);else expect(measured.pairColumns.split(' ')).toHaveLength(1);
 await accessible(page);
});


test('RED-010: contextual suggestion lookup carries its scope and can return to the complete list',async({page})=>{
 await setup(page);const reads:URL[]=[];page.on('request',r=>{const u=new URL(r.url());if(u.pathname.endsWith('/suggestions'))reads.push(u);});
 await page.goto(path+`?elementId=${source}&poolId=${pool}`);await expect(page.getByText('Showing suggestions for the linked scope.')).toBeVisible();expect(reads[0]?.searchParams.get('elementId')).toBe(source);expect(reads[0]?.searchParams.get('poolId')).toBe(pool);
 await page.getByRole('link',{name:'Show all suggestions'}).click();await expect(page).toHaveURL(path);await expect(page.getByText('Showing suggestions for the linked scope.')).toBeHidden();expect(reads.at(-1)?.searchParams.has('elementId')).toBe(false);
 await accessible(page);
});


test('SUG-003/RED-011: every domain is a direct card, members are complete, and consequence has three bullets only after a choice',async({page})=>{
 await setup(page);await page.route('**/api/v1/projects/*/suggestions/domains',r=>r.fulfill({json:{items:[{domain:'treaty',members:[{elementId:source,name:'reinsurance.public.contract.identifier',objectLabel:'contract',columnName:'identifier',version:1}]},{domain:'new',members:[{elementId:pool,name:'reinsurance.public.claim.identifier',objectLabel:'claim',columnName:'identifier',version:1}]}],nextCursor:null}}));
 await page.goto(path);await expect(page.getByRole('radio')).toHaveCount(3);await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('region',{name:'What this changes'})).toHaveCount(0);
 await page.getByText('claim.identifier',{exact:true}).click();await expect(page.getByRole('radio',{name:/Join the new domain/})).toBeChecked();await expect(page.getByRole('region',{name:'What this changes'}).getByRole('listitem')).toHaveCount(3);
 await expect(page.locator('[data-part="review-state"]')).toHaveText('Review state: Awaiting review');await expect(page.getByText('Raised by an attempted join.',{exact:true})).toBeVisible();
 await page.getByRole('radio',{name:'Start a new domain'}).check();await page.getByLabel('New shared domain').fill('newnamespace');await expect(page.getByRole('region',{name:'What this changes'})).toContainText('Only these two columns join the new domain.');await accessible(page);
});

test('RED-011: domain cards abbreviate members, disclose beyond four and stay equal when selected',async({page})=>{
 await setup(page);await page.setViewportSize({width:1440,height:1000});
 const members=Array.from({length:10},(_,i)=>({elementId:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name:`generated.generated.premium_${i}.treaty`,objectLabel:`premium_${i}`,columnName:'treaty',version:1}));
 await page.route('**/api/v1/projects/*/suggestions/domains',r=>r.fulfill({json:{items:[{domain:'treaty',members}],nextCursor:null}}));
 await page.goto(path);const cards=page.locator('.scopepick .opt');await expect(page.getByText('premium_0.treaty',{exact:true})).toHaveAttribute('title','generated.generated.premium_0.treaty');await expect(page.getByText('premium_4.treaty',{exact:true})).toBeHidden();
 const heights=()=>cards.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));const initial=await heights();expect(initial[0]).toBe(initial[1]);
 await page.getByRole('radio',{name:/Join the treaty domain/}).check();expect(await heights()).toEqual(initial);
 await page.getByRole('radio',{name:'Start a new domain'}).check();expect(await heights()).toEqual(initial);
 await page.getByRole('button',{name:'+6 more',exact:true}).click();await expect(page.getByText('premium_9.treaty',{exact:true})).toBeVisible();const expanded=await heights();expect(expanded[0]).toBe(expanded[1]);
 await page.getByRole('button',{name:'Show fewer',exact:true}).click();expect(await heights()).toEqual(initial);console.log('Domain card heights:',JSON.stringify({initial,expanded}));await accessible(page);
});
