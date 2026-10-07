import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {mock,project,pool,source,object,expand} from './entitlements-fixture.js';
async function setup(page:Page){
 await mock(page);const members=Array.from({length:24},(_,i)=>({id:`018f8f9d-7f83-7abc-8def-${String(i+500).padStart(12,'0')}`,group:'name:treaty_ref',name:'treaty_ref',qualifiedName:`warehouse.public.cedant_${i}.treaty_ref`,objectId:object,objectName:`warehouse.public.cedant_${i}`,objectLabel:`cedant_${i}`,sourceId:source,exposedType:i%2?'INTEGER':'VARCHAR',sourceType:i%2?'integer':'text',treatment:i<19?null:'clear' as string|null,maskKind:null as string|null,justification:i<19?null:'Existing approval'}));
 const state={requests:[] as string[],commands:[] as Record<string,unknown>[],fail:false,invalid:false};
 await page.route('**/api/v1/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname;
 if(path.endsWith('/entitlements/bulk')){const body=route.request().postDataJSON() as Record<string,unknown>;state.commands.push(body);
 if(state.invalid)return route.fulfill({status:422,json:{error:{code:'validation_failed',message:'No entitlements were changed.',requestId:'test',retryable:false,details:{invalidElements:[{elementId:members[0]!.id,qualifiedName:members[0]!.qualifiedName,reasons:['Mask does not support this type.']}]}}}});
 for(const member of members)if((body.elementIds as string[]).includes(member.id)){member.treatment=body.treatment as string;member.maskKind=body.maskKind as string|null;}
 return route.fulfill({json:{decisionId:object,poolId:pool,treatment:body.treatment,count:(body.elementIds as string[]).length,decidedAt:'2026-10-06T15:00:00Z'}});
 }
 if(!path.endsWith('/entitlement-groups')&&!path.endsWith('/entitlement-members'))return route.fallback();
 state.requests.push(url.search);
 if(state.fail)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Groups unavailable.',requestId:'test',retryable:true}}});
 const decision=url.searchParams.get('decision')??'undecided',prefix=url.searchParams.get('prefix')??'';
 const filtered=members.filter(m=>m.name.startsWith(prefix)&&(decision==='all'||(decision==='undecided'?m.treatment===null:m.treatment!==null)));
 if(path.endsWith('/entitlement-members')){const start=Number(url.searchParams.get('cursor')??0),limit=5;return route.fulfill({json:{items:filtered.slice(start,start+limit),nextCursor:start+limit<filtered.length?String(start+limit):null}});}
 const types=[...new Set(filtered.map(m=>m.exposedType))].map(value=>({value,count:filtered.filter(m=>m.exposedType===value).length}));
 const maskKinds=[...new Set(filtered.filter(m=>m.treatment==='masked').map(m=>m.maskKind))].map(value=>({value,count:filtered.filter(m=>m.treatment==='masked'&&m.maskKind===value).length}));
 const decisions=[...new Set(filtered.map(m=>m.treatment??'undecided'))].map(value=>({value,count:filtered.filter(m=>(m.treatment??'undecided')===value).length}));
 return route.fulfill({json:{items:filtered.length?[{groupKey:'name:treaty_ref',name:'treaty_ref',count:filtered.length,objects:filtered.length,types,decisions,maskKinds,queries:3,explains:2}]:[],nextCursor:null,totals:{members:filtered.length,groups:filtered.length?1:0,undecided:members.filter(m=>m.treatment===null).length,decisions:[{value:'undecided',count:members.filter(m=>m.treatment===null).length},{value:'clear',count:members.filter(m=>m.treatment==='clear').length}]}}});
 });return {state,members};
}
const path=`/projects/${project}/entitlements`;
test('RED-005/008: mixed summaries precede expansion, and Declarations targets a chosen member',async({page})=>{
 await setup(page);await page.goto(path);const groups=page.getByRole('list',{name:'Entitlement groups',exact:true});
 await expect(groups).toContainText('Mixed · 2 types');await expect(groups).toContainText('Join attempted · 3 query · 2 explain');await expect(page.getByRole('list',{name:'Group members'})).toHaveCount(0);
 await page.getByRole('button',{name:'Everything',exact:true}).click();await expect(groups).toContainText('Mixed · 2 decisions');
 const disclosure=page.getByRole('button',{name:'Members / Declarations',exact:true});await disclosure.click();await expect(page.getByRole('button',{name:'Hide members',exact:true})).toHaveAttribute('aria-expanded','true');
 const member=page.getByRole('list',{name:'Group members'}).getByRole('listitem').filter({has:page.getByText('cedant_0',{exact:true})});
 await expect(member.locator('[data-part=identity] > b')).toHaveText('cedant_0');await expect(member.locator('[data-part=identity] > b')).toHaveAttribute('title','warehouse.public.cedant_0.treaty_ref');
 await expect(member.getByRole('checkbox',{name:'Select warehouse.public.cedant_0.treaty_ref',exact:true})).toBeVisible();
 await expect(groups.locator('[data-part=identity] > b').first()).toHaveCSS('font-size','13.5px');await expect(groups.locator('[data-part=identity] > b').first()).toHaveCSS('font-weight','650');await expect(member.locator('[data-part=identity] > b')).toHaveCSS('font-size','13.5px');await expect(member.locator('[data-part=identity] > b')).toHaveCSS('font-weight','560');
 await expect(member.getByRole('link',{name:'Declarations for warehouse.public.cedant_0.treaty_ref',exact:true})).toHaveAttribute('href',/elementId=018f8f9d-7f83-7abc-8def-000000000500/);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
});
test('RED-006/007: Review all collects unloaded filtered members, reports 19 rather than 24, and uses atomic bulk validation',async({page})=>{
 const {state,members}=await setup(page);await page.goto(path);await page.getByRole('button',{name:'Review all 19',exact:true}).click();
 await expect(page.locator('.bulkbar .n')).toHaveText('19 selected');await expect(page.locator('[data-part=consequence]')).toContainText('these 19 members');expect(state.requests.filter(q=>q.includes('limit=500'))).toHaveLength(4);expect(state.commands).toHaveLength(0);
 await page.getByLabel('Treatment',{exact:true}).selectOption('clear');await expect(page.getByRole('button',{name:'Apply to selection'})).toBeDisabled();await page.getByLabel('Justification (required)').fill('Approved reporting');
 state.invalid=true;await page.getByRole('button',{name:'Apply to selection'}).click();await expect(page.getByRole('alert')).toContainText('No entitlements were changed.');await expect(page.locator('.bulkbar .n')).toHaveText('19 selected');
 const first=state.commands[0]!;expect(new Set(first.elementIds as string[])).toEqual(new Set(members.slice(0,19).map(m=>m.id)));expect(first.justification).toBe('Approved reporting');
 state.invalid=false;await page.getByLabel('Treatment',{exact:true}).selectOption('masked');await expect(page.getByLabel('Mask kind',{exact:true})).toBeVisible();await page.getByLabel('Mask kind',{exact:true}).selectOption('last4');await page.getByRole('button',{name:'Apply to selection'}).click();expect(state.commands[1]!.maskKind).toBe('last4');await expect(page.getByRole('status').filter({hasText:'entitlement decisions saved.'})).toHaveText('19 entitlement decisions saved.');
});
test('RED-006: selecting a filtered mixed-name group changes only the scoped members',async({page})=>{
 const {state,members}=await setup(page);await page.goto(path);await page.getByLabel('Select treaty_ref',{exact:true}).check();await expect(page.locator('.bulkbar .n')).toHaveText('19 selected');await page.getByRole('button',{name:'Apply to selection'}).click();expect(new Set(state.commands[0]!.elementIds as string[])).toEqual(new Set(members.slice(0,19).map(m=>m.id)));
 await page.getByRole('button',{name:'Everything',exact:true}).click();await expect(page.locator('.bulkbar')).toHaveCount(0);await page.getByLabel('Select treaty_ref',{exact:true}).check();await expect(page.locator('.bulkbar .n')).toHaveText('24 selected');await page.getByLabel('Select treaty_ref',{exact:true}).uncheck();await expect(page.locator('.bulkbar')).toHaveCount(0);
});
test('RED-006: Review all replaces a broader selection, and Decided does not select hidden pending members',async({page})=>{
 await setup(page);await page.goto(path);await page.getByRole('button',{name:'Everything',exact:true}).click();await page.getByLabel('Select treaty_ref',{exact:true}).check();await expect(page.locator('.bulkbar .n')).toHaveText('24 selected');await page.getByRole('button',{name:'Review all 19',exact:true}).click();await expect(page.locator('.bulkbar .n')).toHaveText('19 selected');await page.getByRole('button',{name:'Decided',exact:true}).click();await expect(page.locator('.bulkbar')).toHaveCount(0);await expect(page.getByRole('button',{name:'Review all 19',exact:true})).toHaveCount(0);
});
test('RED-005: different mask kinds are different decisions before expansion',async({page})=>{
 const {members}=await setup(page);members[0]!.treatment='masked';members[0]!.maskKind='all';members[1]!.treatment='masked';members[1]!.maskKind='last4';await page.goto(path);await page.getByRole('button',{name:'Everything',exact:true}).click();await expect(page.getByRole('list',{name:'Entitlement groups',exact:true})).toContainText('Mixed · 4 decisions');await expect(page.getByRole('list',{name:'Group members'})).toHaveCount(0);
});
test('RED-005: pending count stays on its tab and its empty state stays in scope',async({page})=>{
 const {members}=await setup(page);for(const member of members)member.treatment='clear';
 await page.goto(path+'?decision=decided');
 const pending=page.getByRole('group',{name:'Decision filter'}).getByRole('button',{name:/Needs a decision/});
 await expect(pending).toHaveText('Needs a decision0');await expect(pending).toHaveAttribute('aria-pressed','false');
 await expect(page.getByRole('list',{name:'Entitlement groups',exact:true})).toBeVisible();
 await expect(page.getByText('No undecided elements',{exact:true})).toHaveCount(0);await expect(page.getByText(/elements are waiting on a decision/)).toHaveCount(0);
 await pending.click();await expect(page.getByText('No undecided elements',{exact:true})).toBeVisible();
 await expect(pending).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Decided',exact:true}).click();await expect(page.getByText('No undecided elements',{exact:true})).toHaveCount(0);
});
for(const width of [390,900,1440])test(`Grouped entitlements at ${width}`,{tag:'@visual'},async({page})=>{
 await setup(page);await page.setViewportSize({width,height:1000});await page.goto(path);await page.getByRole('button',{name:'Everything',exact:true}).click();await page.getByRole('button',{name:'Members / Declarations',exact:true}).click();await page.getByRole('button',{name:'Review all 19',exact:true}).click();await page.getByLabel('Treatment',{exact:true}).selectOption('clear');await page.getByLabel('Justification (required)').fill('Approved for reporting');
 await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>window.scrollTo(0,0));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const name=page.getByRole('list',{name:'Entitlement groups',exact:true}).locator('[data-part=identity]').first().locator('b').first();expect(await name.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length;}),'The exposed name must fit without one-character wrapping').toBe(1);
 const consequence=page.locator('[data-part=consequence]');expect(await consequence.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()];return rects.length?Math.max(...rects.map(r=>r.width)):0;}),'The action consequence must have room for a readable line').toBeGreaterThan(120);
 await expect(page).toHaveScreenshot(`grouped-entitlements-${width}.png`,{fullPage:true});
 const group=page.getByRole('list',{name:'Entitlement groups',exact:true}).locator('[data-part=identity]').first();await expect(group).toContainText('treaty_ref');await expect(group).toContainText('Mixed · 2 decisions');await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
});

test('RED-008: repeated demo justification stays recorded but is absent from member rows',async({page})=>{
 const {members}=await setup(page);for(const member of members)if(member.treatment)member.justification='Development demo: synthetic reinsurance data.';
 await page.goto(path+'?decision=decided');await page.getByRole('button',{name:'Members / Declarations',exact:true}).click();
 await expect(page.getByRole('list',{name:'Group members'}).getByText('cedant_19',{exact:true})).toBeVisible();
 await expect(page.getByText('Development demo: synthetic reinsurance data.',{exact:true})).toHaveCount(0);
 expect(members[19]!.justification).toBe('Development demo: synthetic reinsurance data.');
});

for(const width of [390,900,1280,1440])test(`Entitlements measured rebuild at ${width}`,async({page})=>{
 await setup(page);await page.setViewportSize({width,height:1000});await page.goto(path);await page.getByRole('button',{name:'Everything',exact:true}).click();await page.getByRole('button',{name:'Members / Declarations',exact:true}).click();await page.evaluate(()=>document.fonts.ready);
 const measurements=await page.evaluate(()=>{
 const screen=document.querySelector('.screen[data-layout="decisions"]')!;
 const style=(selector:string)=>{const el=screen.querySelector(selector)!;const s=getComputedStyle(el),r=el.getBoundingClientRect();return {fontSize:s.fontSize,fontWeight:s.fontWeight,width:r.width,height:r.height,x:r.x,y:r.y};};
 return {width:innerWidth,group:style('[data-row="entitlement-group"] [data-part="identity"] > b'),member:style('[data-row="entitlement-member"] [data-part="identity"] > b'),groupRow:style('[data-row="entitlement-group"]'),memberRow:style('[data-row="entitlement-member"]'),distribution:style('.spec'),toolbar:style('[data-part="decision-toolbar"]'),filter:style('[data-part="name-filter"]'),type:style('[data-row="entitlement-member"] [data-part="type"]'),mark:style('[data-row="entitlement-member"] [data-mark]'),body:styleFromBody()};
 function styleFromBody(){const body=document.querySelector('.body')!;const s=getComputedStyle(body);return {maxWidth:s.maxWidth,padding:s.padding};}
 });
 console.log('ENTITLEMENTS_MEASUREMENTS '+JSON.stringify(measurements));
 expect(measurements.group.fontSize).toBe('13.5px');expect(measurements.group.fontWeight).toBe('650');expect(measurements.member.fontSize).toBe('13.5px');expect(measurements.member.fontWeight).toBe('560');expect(measurements.distribution.height).toBeLessThanOrEqual(150);expect(measurements.filter.width).toBe(190);expect(measurements.type.fontSize).toBe('11.5px');expect(measurements.mark.width).toBe(17);expect(measurements.mark.height).toBe(17);expect(measurements.body).toEqual({maxWidth:'1500px',padding:'20px 26px 40px'});
 if(width>=1280){expect(measurements.groupRow.height).toBe(42);expect(measurements.memberRow.height).toBe(38);expect(measurements.toolbar.height).toBe(36);}
 if(width===390){const tabs=page.getByRole('group',{name:'Decision filter'}),grouping=page.getByRole('group',{name:'Group elements'});const tb=await tabs.boundingBox(),gb=await grouping.boundingBox();expect(gb!.y).toBeGreaterThanOrEqual(tb!.y+36);expect(measurements.memberRow.height).toBe(76);}
 await expect(page.getByRole('button',{name:'View DDL',exact:true})).toHaveCount(0);await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [390,1440])test(`Treatment legend and accessible row marks at ${width}`,async({page})=>{
 await setup(page);await page.setViewportSize({width,height:1000});await page.goto(path);
 const legend=page.getByRole('region',{name:'Decision distribution'});
 for(const label of ['In the clear','Masked','Aggregate only','Tokenized','Withheld','Undecided']){const mark=legend.getByRole('img',{name:label,exact:true});await expect(mark).toBeVisible();expect(await mark.evaluate(el=>el.getBoundingClientRect().width)).toBe(17);}
 expect(await legend.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(150);
 console.log('LEGEND_LINES '+JSON.stringify({width,lines:await legend.locator('.speclegend').evaluate(el=>new Set([...el.children].map(child=>child.getBoundingClientRect().top)).size)}));
 await page.getByRole('button',{name:'Everything',exact:true}).focus();const focus=await page.getByRole('button',{name:'Everything',exact:true}).evaluate(el=>({outline:getComputedStyle(el).outlineColor,green:getComputedStyle(document.querySelector('#opintel-app')!).getPropertyValue('--green').trim(),width:getComputedStyle(el).outlineWidth}));expect(focus.outline).toBe('rgb(12, 198, 85)');expect(focus.width).toBe('2px');
 await page.getByRole('button',{name:'Members / Declarations',exact:true}).first().click();
 const rows=page.locator('[data-row=entitlement-member]');await expect(rows.first()).toBeVisible();
 for(const mark of await rows.locator('[data-mark-category=treatment]').all()){await expect(mark).toHaveAttribute('role','img');expect(await mark.getAttribute('aria-label')).toBeTruthy();const name=await mark.getAttribute('data-mark');const peer=legend.locator(`[data-mark="${name}"]`);expect(await mark.evaluate(el=>getComputedStyle(el).getPropertyValue('--plum'))).toBe(await peer.evaluate(el=>getComputedStyle(el).getPropertyValue('--plum')));}
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
});

for(const width of [390,599,600])test(`Treatment name disclosure at ${width}`,async({page})=>{
 const {members}=await setup(page);if(width===600)members[0]!.treatment='aggregate_only';await page.setViewportSize({width,height:1000});await page.goto(width===600?path+'?decision=all':path);await page.getByRole('button',{name:'Members / Declarations',exact:true}).first().click();
 const row=page.locator('[data-row=entitlement-member]').first(),trigger=row.getByRole('button',{name:'Show treatment: Undecided',exact:true});
 if(width>=600){await expect(trigger).toHaveCount(0);await expect(row.locator('[data-part=treatment-visible]')).toHaveText('Aggregate only');}
 else{
 const box=await trigger.boundingBox();console.log('TREATMENT_TARGET '+JSON.stringify({width,...box}));expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
 const geometry=await row.evaluate(el=>{const row=el.getBoundingClientRect(),name=el.querySelector('[data-part=identity]')!.getBoundingClientRect(),button=el.querySelector('[data-treatment-trigger]')!.getBoundingClientRect(),action=el.querySelector('[data-part=declarations]')!.getBoundingClientRect();return {height:row.height,clearName:button.top>=name.bottom,clearAction:button.right<=action.left,inside:button.bottom<=row.bottom};});expect(geometry).toEqual({height:76,clearName:true,clearAction:true,inside:true});
 await trigger.click();const popup=page.locator('.pop[data-purpose=treatment-name]:visible');await expect(popup).toHaveText('Undecided');const bounds=await popup.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(8);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width-8);expect(bounds!.y).toBeGreaterThanOrEqual(8);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(992);
 await page.getByRole('heading',{name:'Entitlements',exact:true}).click();await expect(popup).toHaveCount(0);await trigger.click();await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(trigger).toBeFocused();await trigger.click();await trigger.click();await expect(popup).toHaveCount(0);
 await expand(page);const treeTrigger=page.locator('[data-catalog-tree] [data-treatment-trigger]').first();await expect(treeTrigger).toBeVisible();const treeBox=await treeTrigger.boundingBox();expect(treeBox!.width).toBe(44);expect(treeBox!.height).toBe(44);await treeTrigger.click();await expect(page.locator('.pop[data-purpose=treatment-name]:visible')).toHaveCount(1);await page.keyboard.press('Escape');await expect(page.locator('.pop[data-purpose=treatment-name]:visible')).toHaveCount(0);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
});

for(const width of [390,1440])test(`Dark action bar controls at ${width}`,async({page})=>{
 await setup(page);await page.setViewportSize({width,height:1000});await page.goto(path);await page.evaluate(()=>document.fonts.ready);await page.getByRole('button',{name:'Review all 19',exact:true}).click();
 const treatment=page.getByRole('combobox',{name:'Treatment',exact:true});await treatment.selectOption('masked');
 for(const name of ['Treatment','Mask kind']){
 const select=page.getByRole('combobox',{name,exact:true});const geometry=await select.evaluate(el=>{const s=getComputedStyle(el),parent=el.parentElement!,box=parent.getBoundingClientRect(),ps=getComputedStyle(parent),arrow=parent.querySelector('[data-part=picker-chevron]')!.getBoundingClientRect();const ctx=document.createElement('canvas').getContext('2d')!;ctx.font=`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;return {bearing:ctx.measureText((el as HTMLSelectElement).selectedOptions[0]!.text).actualBoundingBoxLeft,left:parseFloat(s.paddingLeft),right:box.right-parseFloat(ps.borderRightWidth)-arrow.right,selectWidth:el.getBoundingClientRect().width,background:ps.backgroundColor,text:s.color,arrow:getComputedStyle(parent.querySelector('[data-part=picker-chevron]')!).color};});console.log('DARK_PICKER '+JSON.stringify({viewport:width,name,...geometry}));expect(geometry.right).toBe(10);expect(geometry.left).toBe(10);expect(geometry.background).toBe('rgb(46, 17, 71)');expect(geometry.text).toBe('rgb(255, 255, 255)');expect(geometry.arrow).toBe(geometry.text);
 await select.screenshot({path:`test-results/dark-picker-${width}-${name.replace(' ','-')}.png`});
 }
 const input=page.getByRole('textbox',{name:'Justification',exact:true});await input.evaluate(el=>el.setAttribute('placeholder','Placeholder contrast check'));const palette=await input.evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color,placeholder:getComputedStyle(el,'::placeholder').color,opacity:getComputedStyle(el,'::placeholder').opacity}));console.log('DARK_INPUT '+JSON.stringify({width,...palette}));expect(palette).toEqual({background:'rgb(46, 17, 71)',text:'rgb(255, 255, 255)',placeholder:'rgb(237, 232, 243)',opacity:'1'});await input.fill('Reviewed for reporting');await expect(input).toHaveValue('Reviewed for reporting');await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [390,1280,1440])test(`Entitlements picker values and segments at ${width}`,async({page})=>{
 await setup(page);
 const names={pool:'Development Demo',source:'Reinsurance bordereaux'};
 await page.route('**/api/v1/**',async route=>{
 const pathname=new URL(route.request().url()).pathname;
 if(pathname.endsWith('/pools'))return route.fulfill({json:{items:[{id:pool,name:names.pool,sourceIds:[source]},{id:'018f8f9d-7f83-7abc-8def-000000000005',name:'A substantially longer unselected pool option for sizing diagnostics',sourceIds:[source]}],nextCursor:null}});
 if(pathname.endsWith('/sources'))return route.fulfill({json:{items:[{id:source,name:names.source,exposedAlias:'reinsurance',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:null,filingCount:null,elementCount:24,unsupportedCount:0,undecidedCount:19,latestIntrospectionId:null,lastIntrospectedAt:null}],nextCursor:null}});
 return route.fallback();
 });
 await page.setViewportSize({width,height:1000});await page.goto(path);await page.evaluate(()=>document.fonts.ready);
 // Measure the selected glyphs, not the longest unselected option.
 for(const name of ['Pool','Source']){
 const select=page.getByRole('combobox',{name,exact:true});
 await select.screenshot({path:`test-results/picker-${width}-${name}.png`});
 const geometry=await select.evaluate(el=>{const node=el as HTMLSelectElement,s=getComputedStyle(node),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;ctx.font=`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;const selected=ctx.measureText(node.selectedOptions[0]!.text).width;return {selected,width:node.getBoundingClientRect().width,available:node.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),right:parseFloat(s.paddingRight),left:parseFloat(s.paddingLeft),chevronInset:node.parentElement!.getBoundingClientRect().right-parseFloat(getComputedStyle(node.parentElement!).borderRightWidth)-node.parentElement!.querySelector('[data-part=picker-chevron]')!.getBoundingClientRect().right,height:parseFloat(getComputedStyle(node.parentElement!).height),supported:CSS.supports('field-sizing','content')};});
 console.log('ENTITLEMENTS_PICKER '+JSON.stringify({viewport:width,name,...geometry}));
 expect(geometry.width).toBeLessThanOrEqual(200);expect(geometry.height).toBe(36);
 expect(geometry.chevronInset).toBe(geometry.left);if(geometry.supported && width>=1280)expect(geometry.available).toBeGreaterThanOrEqual(Math.floor(geometry.selected));
 }
 if(width===1440){await page.evaluate(()=>{for(const sheet of document.styleSheets){for(let i=sheet.cssRules.length-1;i>=0;i--){const rule=sheet.cssRules[i];if(rule instanceof CSSSupportsRule && rule.conditionText.includes('field-sizing'))sheet.deleteRule(i);}}});for(const name of ['Pool','Source']){const fallback=await page.getByRole('combobox',{name,exact:true}).evaluate(el=>({width:el.getBoundingClientRect().width,sizing:getComputedStyle(el).getPropertyValue('field-sizing')}));console.log('ENTITLEMENTS_FALLBACK '+JSON.stringify({name,...fallback}));expect(fallback.width).toBe(170);expect(fallback.sizing).toBe('fixed');}}
 if(width>=1280){const toolbar=page.locator('[data-part="decision-toolbar"]');expect(await toolbar.evaluate(el=>el.getBoundingClientRect().height)).toBe(36);}
 const tabs=page.getByRole('group',{name:'Decision filter'}),grouping=page.getByRole('group',{name:'Group elements'});
 await expect(tabs.getByRole('button',{name:/Needs a decision/})).toContainText('19');await expect(grouping.getByRole('button',{name:'By name',exact:true})).toHaveAttribute('aria-pressed','true');
 const appearance=await tabs.evaluate(el=>{const s=getComputedStyle(el),selected=getComputedStyle(el.querySelector('[aria-pressed="true"]')!),other=getComputedStyle(el.querySelector('[aria-pressed="false"]')!);return {border:s.borderTopColor,rule:getComputedStyle(document.querySelector('#opintel-app')!).getPropertyValue('--rule').trim(),selectedWeight:selected.fontWeight,otherWeight:other.fontWeight,selectedBackground:selected.backgroundColor,otherBackground:other.backgroundColor,height:parseFloat(s.height)};});
 expect(appearance.selectedWeight).toBe('600');expect(appearance.otherWeight).toBe('500');expect(appearance.selectedBackground).not.toBe(appearance.otherBackground);expect(appearance.height).toBe(36);
 // Switching remains a single button click; the picker must still route the
 // selected source and expose its full label, without replacing the segments.
 await grouping.getByRole('button',{name:'By table',exact:true}).click();await expect(grouping.getByRole('button',{name:'By table',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('combobox',{name:'Source',exact:true}).selectOption(source);await expect(page.getByRole('combobox',{name:'Source',exact:true})).toHaveValue(source);
 if(width===390){const tb=await tabs.boundingBox(),gb=await grouping.boundingBox();expect(gb!.y).toBeGreaterThanOrEqual(tb!.y+36);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
});
