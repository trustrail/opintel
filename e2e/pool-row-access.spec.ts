import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {mock as mockEntitlements,pool as entitlementPool} from './entitlements-fixture.js';
import {rowReview} from './row-review.js';
import {mockPools,poolPath,project,pool,version} from './pools-fixture.js';
const uid=(n:number)=>`018f8f9d-7f83-7abc-8def-${String(n).padStart(12,'0')}`;
async function setup(page:Page,initial:'empty'|'decisions'){
 await mockPools(page);await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));
 const state={mode:initial};const calls:string[]=[];
 const item=(n:number)=>({id:uid(1000+n),name:`object_${String(n).padStart(3,'0')}`,sourceId:uid(n%2===0?400:401),sourceName:n%2===0?'Warehouse':'Claims',status:n<3?'overridden':n===3?'missing':n===204?'unscoped':'inherited',hasDefault:n!==3&&n!==204,decision:n<3?{id:uid(500+n),words:'region equals "EU"',actorName:'Administrator',decidedAt:'2026-10-06T12:00:00Z'}:null});
 const objects=Array.from({length:205},(_,n)=>item(n));
 await page.route('**/row-entitlements?*',route=>{const u=new URL(route.request().url()),status=u.searchParams.get('status'),search=u.searchParams.get('search')??'',cursor=u.searchParams.get('cursor');calls.push(status??'');let rows=state.mode==='empty'?[]:objects.filter(o=>(status==='all'||o.status===status)&&o.name.includes(search)&&(cursor===null||o.id>cursor));if(status==='unscoped')rows=[];return route.fulfill({json:{projectHasDefault:true,counts:state.mode==='empty'?{missing:0,overridden:0,inherited:200,unscoped:5}:{missing:1,overridden:3,inherited:200,unscoped:1},items:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.id:null}});});
 const base={id:uid(800),level:'object_default',expression:"region = 'EU'",hash:'a'.repeat(64),actorId:version,decidedAt:'2026-10-06T12:00:00Z',firstScoping:true};
 async function mockEditor(){
 await page.route('**/row-entitlements/*',route=>route.fulfill({json:{objectId:uid(1000),objectName:'object_000',poolId:pool,scoped:true,columns:[{id:uid(900),name:'region',sourceIdentifier:'region',type:'VARCHAR'}],current:null,objectDefault:base,effectiveExpression:base.expression,pools:[...Array.from({length:2},(_,i)=>({id:uid(2000+i),name:`Restricted ${i+1}`,status:'overridden'})),...Array.from({length:20},(_,i)=>({id:uid(3000+i),name:`Inherited ${i+1}`,status:'inherited'}))]}}));
 await page.route('**/row-entitlements/*/history?*',route=>route.fulfill({json:{items:[],nextCursor:null}}));
 }
 await mockEditor();

 return {state,calls,mockEditor};
}
for(const width of [390,900,1440]){
test(`ROW-SCALE empty, overrides and missing filters at ${width}`,{tag:'@visual'},async({page},info)=>{
 const {state}=await setup(page,'empty');await page.setViewportSize({width,height:1000});await page.goto(poolPath);const section=page.getByRole('region',{name:'Pool row entitlements'});
 await expect(section.getByLabel('Search by object name')).toHaveCount(0);await expect(section).toContainText("No overrides. This pool follows each object's default.");await expect(section.getByRole('button',{name:'Add override',exact:true})).toHaveCount(1);await rowReview(page,info,'pool-row-empty',width);
 state.mode='decisions';await page.reload();await expect(section.getByRole('listitem')).toHaveCount(3);await expect(section).toContainText('Administrator');await expect(section).toContainText('region equals "EU"');expect(await section.locator('[data-part=identity]').first().evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(100);await rowReview(page,info,'pool-row-three-overrides',width);
 await section.getByRole('button',{name:'1 missing filters',exact:true}).click();await expect(section.getByRole('listitem')).toHaveCount(1);await expect(section.getByRole('button',{name:'Add override for object_003',exact:true})).toBeVisible();await expect(section.getByRole('link',{name:'Needs You · missing filters'})).toHaveAttribute('href',/dashboard#row-access-needs-you/);await rowReview(page,info,'pool-row-missing-filters',width);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test(`ROW-SCALE inherited pagination and shared picker at ${width}`,{tag:'@visual'},async({page},info)=>{
 const {calls}=await setup(page,'decisions');await page.setViewportSize({width,height:1000});await page.goto(poolPath);const section=page.getByRole('region',{name:'Pool row entitlements'});
 await section.getByRole('button',{name:'200 inherit a default',exact:true}).click();await expect(section.getByRole('listitem')).toHaveCount(50);await expect(section.getByRole('button',{name:/Edit override for/})).toHaveCount(0);await expect(section.getByRole('link',{name:/Open object /})).toHaveCount(50);await rowReview(page,info,'pool-row-inherited-200',width);
 const first=await section.getByRole('listitem').first().textContent()??'';await section.getByRole('button',{name:'Next decisions'}).click();await expect(section.getByRole('listitem')).toHaveCount(50);await expect(section.getByRole('listitem').first()).not.toHaveText(first);await section.getByRole('button',{name:'Previous decisions'}).click();await expect(section.getByRole('listitem').first()).toHaveText(first);
 await expect(section.getByRole('link',{name:'1 no row filter',exact:true})).toHaveAttribute('href',/rowFilter=unscoped/);
 await section.getByRole('button',{name:'3 overrides',exact:true}).click();await section.getByLabel('Search by object name').fill('object_001');await expect(section.getByRole('listitem')).toHaveCount(1);await expect(section.getByRole('button',{name:'3 overrides',exact:true})).toBeVisible();await section.getByRole('button',{name:'Add override',exact:true}).click();const picker=page.getByRole('dialog',{name:'Choose objects'});await expect(picker.locator('[data-object-picker-row]')).toHaveCount(50);await rowReview(page,info,'shared-object-picker',width);
 await picker.getByRole('button',{name:'Next objects'}).click();await expect(picker.locator('[data-object-picker-row]')).toHaveCount(50);await picker.getByLabel('Search objects').fill('object_004');await expect(picker.locator('[data-object-picker-row]')).toHaveCount(1);await picker.getByRole('button',{name:'Choose object_004'}).click();const editor=page.getByRole('region',{name:'Row entitlement editor'});await expect(editor).toContainText('Object default (read-only)');await expect(editor.getByRole('button',{name:'Close row editor'})).toBeInViewport();await expect(editor.getByRole('button',{name:'Close row editor'})).toBeFocused();await expect(editor.getByRole('group',{name:'Decision level'})).toHaveCount(0);await expect(editor.getByRole('button',{name:'Object default · every pool'})).toHaveCount(0);await editor.getByRole('button',{name:'Close row editor'}).click();
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(calls).toContain('all');
});
test(`ROW-SCALE object pool statuses at ${width}`,{tag:'@visual'},async({page},info)=>{
 const {mockEditor}=await setup(page,'decisions');await page.setViewportSize({width,height:1000});const editor=page.getByRole('region',{name:'Row entitlement editor'});
 await mockEntitlements(page);await mockEditor();await page.goto(`/projects/${project}/entitlements?poolId=${entitlementPool}&rowObjectId=${uid(1000)}`);
 // Keep the real object editor; the rest of this route uses its regular fixture.
 await expect(editor.getByRole('region',{name:'Pool row inheritance'})).toBeVisible();
 const inheritance=editor.getByRole('region',{name:'Pool row inheritance'});await expect(inheritance.getByText(/Restricted \d · overridden/)).toHaveCount(2);await expect(inheritance.getByText(/Inherited \d+ · inherited/)).toHaveCount(0);await expect(inheritance.getByRole('button',{name:'20 inherited pools'})).toBeVisible();await rowReview(page,info,'object-two-overridden-twenty-inherited',width);await inheritance.getByRole('button',{name:'20 inherited pools'}).click();await expect(inheritance.getByText(/Inherited \d+ · inherited/)).toHaveCount(20);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
}

for(const width of [390,900,1440]){
test(`ROW-SCALE no row filter discovery and no-default override at ${width}`,{tag:'@visual'},async({page},info)=>{
 await mockPools(page);await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));await page.setViewportSize({width,height:1000});
 let saved=false;const decision={id:uid(850),level:'pool_override',expression:"region = 'EU'",hash:'b'.repeat(64),actorId:version,decidedAt:'2026-10-06T15:43:00Z',firstScoping:true};
 const objects=Array.from({length:11},(_,n)=>({id:uid(1000+n),name:`object_${String(n).padStart(3,'0')}`,sourceId:uid(400),sourceName:'Warehouse',hasDefault:false}));
 await page.route('**/row-entitlements?*',route=>{const u=new URL(route.request().url()),status=u.searchParams.get('status'),search=u.searchParams.get('search')??'';const rows=objects.map((o,n)=>({...o,status:saved&&n===0?'overridden':'unscoped',decision:saved&&n===0?{id:decision.id,words:'region equals "EU"',actorName:'Administrator',decidedAt:decision.decidedAt}:null})).filter(o=>(status==='all'||o.status===status)&&o.name.includes(search));return route.fulfill({json:{projectHasDefault:false,counts:{missing:0,overridden:saved?1:0,inherited:0,unscoped:saved?10:11},items:rows,nextCursor:null}});});
 await page.route('**/row-entitlements/*',async route=>{if(route.request().method()==='PUT'){expect(route.request().postDataJSON()).toEqual({projectId:project,expression:decision.expression,level:'pool_override'});saved=true;return route.fulfill({json:decision});}return route.fulfill({json:{objectId:objects[0]!.id,objectName:'object_000',poolId:pool,scoped:saved,columns:[{id:uid(900),name:'region',sourceIdentifier:'region',type:'VARCHAR'}],current:saved?decision:null,objectDefault:null,effectiveExpression:saved?"(region = 'EU')":null,pools:[]}});});
 await page.goto(poolPath);const section=page.getByRole('region',{name:'Pool row entitlements'});
 await expect(section).toContainText('No object in this project has a row filter yet.');await expect(section.getByLabel('Search by object name')).toHaveCount(0);await expect(section.getByRole('link',{name:'11 no row filter'})).toHaveAttribute('href',/rowFilter=unscoped/);await rowReview(page,info,'pool-row-all-unscoped-empty',width);
 await section.getByRole('button',{name:'Add override',exact:true}).click();const picker=page.getByRole('dialog',{name:'Choose objects'});await expect(picker.locator('[data-object-picker-row]')).toHaveCount(11);await expect(picker.getByText('no default',{exact:true})).toHaveCount(11);await rowReview(page,info,'picker-no-default-object',width);
 await page.addScriptTag({content:axe.source});expect((await page.evaluate(async()=>await axe.run())).violations).toEqual([]);
 await picker.getByRole('button',{name:'Choose object_000',exact:true}).click();const editor=page.getByRole('region',{name:'Row entitlement editor'});await expect(editor).toContainText('No object default.');await editor.getByRole('button',{name:'Text',exact:true}).click();await editor.getByLabel('Row predicate for this object and pool').fill(decision.expression);await editor.getByRole('button',{name:'Save row decision'}).click();await expect(editor.getByRole('status')).toHaveText('Row decision saved.');await rowReview(page,info,'override-no-default-editor',width);await editor.getByRole('button',{name:'Close row editor'}).click();await expect(section.getByRole('listitem')).toHaveCount(1);await expect(section.getByLabel('Search by object name')).toBeVisible();await expect(section).toContainText('region equals "EU"');await rowReview(page,info,'override-created-no-default',width);
 await section.getByLabel('Search by object name').focus();await section.getByLabel('Search by object name').pressSequentially('absent',{delay:80});await expect(section.getByLabel('Search by object name')).toHaveValue('absent');await expect(section.getByLabel('Search by object name')).toBeFocused();await expect(section).toContainText('No matching decisions.');await expect(section.getByLabel('Search by object name')).toBeVisible();await section.getByLabel('Search by object name').fill('');
 expect((await page.evaluate(async()=>await axe.run())).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await mockEntitlements(page);await page.route('**/projects/*/pools',route=>route.fulfill({json:{items:[{id:pool,name:'Reporting pool',sourceIds:['018f8f9d-7f83-7abc-8def-000000000002']}],nextCursor:null}}));
 const catalogue=page.waitForRequest(r=>r.url().includes('/entitlement-groups?')&&new URL(r.url()).searchParams.get('rowFilter')==='unscoped');
 const tree=page.waitForRequest(r=>r.url().includes('/entitlements?')&&new URL(r.url()).searchParams.get('rowFilter')==='unscoped');
 await section.getByRole('link',{name:'10 no row filter',exact:true}).click();await catalogue;await tree;await expect(page.getByText('Objects with no row filter.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Everything',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Show all objects',exact:true}).click();await expect(page).not.toHaveURL(/rowFilter/);
});
}
