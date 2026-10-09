import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {mockPools,poolsPath,poolPath,twinPath,credential,version} from './pools-fixture.js';
async function accessible(page:Parameters<typeof mockPools>[0]){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test.use({reducedMotion:'reduce'});
for(const width of [390,900,1440])test(`5.14 Pools, detail, twin and key dialogs at ${width}`,{tag:'@visual'},async({page})=>{
 await mockPools(page);await page.setViewportSize({width,height:1000});
 for(const [path,name,file]of [[poolsPath,'Pools','pools'],[poolPath,'Reporting pool','pool-detail'],[twinPath,'Agent twin','agent-twin']] as const){await page.goto(path);await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(page.getByText('Preparing this view')).toHaveCount(0);await accessible(page);await expect(page).toHaveScreenshot(`${file}-${width}.png`,{fullPage:true});}
 await page.goto(poolPath);await page.getByRole('button',{name:'Revoke current key'}).click();await expect(page.getByRole('heading',{name:'1 affected agents'})).toBeVisible();await accessible(page);await expect(page).toHaveScreenshot(`revoke-${width}.png`,{fullPage:true});await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Rotate key',exact:true}).click();await expect(page.getByRole('heading',{name:'1 affected agents'})).toBeVisible();await page.getByRole('button',{name:'Confirm rotation'}).click();await expect(page.getByLabel('New pool key')).toHaveValue(credential);await accessible(page);await expect(page).toHaveScreenshot(`shown-once-${width}.png`,{fullPage:true});
});
test('I-001: copy succeeds before deliberate dismissal; Escape, backdrop, retries and cache cannot recover key',async({page})=>{
 const state=await mockPools(page);state.empty=true;await page.goto(poolsPath);await page.getByRole('button',{name:'Create a pool'}).click();await page.getByLabel('Pool name').fill('Reporting pool');await page.getByRole('button',{name:'Create pool',exact:true}).click();
 const dismiss=page.getByRole('button',{name:'I copied the key — dismiss'});await expect(dismiss).toBeDisabled();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();await page.locator('.modal').click({position:{x:2,y:2}});await expect(page.getByRole('dialog')).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}},configurable:true}));await page.getByRole('button',{name:'Copy key',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Copy failed');await expect(dismiss).toBeDisabled();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true}));await page.getByRole('button',{name:'Copy key',exact:true}).click();await expect(dismiss).toBeEnabled();await dismiss.click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText(credential)).toHaveCount(0);
 await page.getByRole('link',{name:'Reporting pool',exact:true}).click();await page.goBack();await expect(page.getByLabel('New pool key')).toHaveCount(0);
 state.replay=true;await page.getByRole('button',{name:'Create a pool'}).click();await page.getByLabel('Pool name').fill('Another pool');await page.getByRole('button',{name:'Create pool',exact:true}).click();await expect(page.getByRole('dialog',{name:'Key already shown'})).toBeVisible();await expect(page.getByLabel('New pool key')).toHaveCount(0);
});
test('I-015/017: rotation names grace and impact; revocation requires pool name and separates disconnected agents',async({page})=>{
 const state=await mockPools(page);await page.goto(poolsPath);await page.getByRole('link',{name:'Reporting pool',exact:true}).click();await page.getByRole('link',{name:'reporter',exact:true}).click();await expect(page.getByText('disconnected',{exact:true})).toBeVisible();await page.getByRole('navigation',{name:'Breadcrumb'}).getByRole('link',{name:'Reporting pool'}).click();await page.getByRole('button',{name:'Rotate key',exact:true}).click();await expect(page.getByText(/current key stays valid for 24 hours/)).toBeVisible();await expect(page.getByRole('heading',{name:'1 affected agents'})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Revoke current key'}).click();await expect(page.getByRole('heading',{name:'Seen previously · disconnected'})).toBeVisible();await expect(page.getByRole('dialog').getByText('reporter',{exact:true})).toBeVisible();const revoke=page.getByRole('button',{name:'Confirm revocation'});await expect(revoke).toBeDisabled();await page.getByLabel('Type Reporting pool to confirm').fill('wrong');await expect(revoke).toBeDisabled();await page.getByLabel('Type Reporting pool to confirm').fill('Reporting pool');await revoke.click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('No working key. Agents cannot authenticate.')).toBeVisible();expect(state.posts.at(-1)?.body).toMatchObject({confirmation:'Reporting pool',keyVersion:version});
 await page.getByRole('link',{name:'reporter',exact:true}).click();await expect(page.getByText(/key no longer authorizes requests/)).toBeVisible();await expect(page.getByText('disconnected',{exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Breadcrumb'}).getByRole('link',{name:'Reporting pool'}).click();await page.getByRole('navigation',{name:'Breadcrumb'}).getByRole('link',{name:'Pools',exact:true}).click();await expect(page.getByText('No working key',{exact:true})).toBeVisible();
});
test('I-019/020: retained twin, SSE reconnect refresh and screen states',async({page})=>{
 const state=await mockPools(page);state.loading=true;await page.goto(poolsPath);await expect(page.getByText('Preparing this view')).toBeVisible();await expect(page.getByText('3%',{exact:true})).toBeVisible();state.loading=false;state.empty=true;await page.reload();await expect(page.getByText('No pools yet',{exact:true})).toBeVisible();await accessible(page);state.empty=false;
 for(const path of [poolsPath,poolPath,twinPath]){state.error=true;await page.goto(path);await expect(page.getByText('Pools are temporarily unavailable.').first()).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).first().click();await expect(page.getByText('Pools are temporarily unavailable.')).toHaveCount(0);}
 await expect(page.getByText(/Disconnected. This twin is retained/)).toBeVisible();state.twin.presence.state='active';state.twin.presence.reconnects=3;
 await page.evaluate(()=>{const stream=(window as unknown as {poolStream:{onmessage:(e:{data:string})=>void}}).poolStream;stream.onmessage({data:JSON.stringify({type:'snapshot',sequence:0,at:new Date().toISOString(),invalidate:['agentPresence']})});});await expect(page.getByText('active',{exact:true})).toBeVisible();
});

test('I-016: expired key impact, n/a denominator and absent-agent states',async({page})=>{
 const state=await mockPools(page);state.detail.keys[0]={...state.detail.keys[0]!,state:'expired',graceUntil:'2026-09-02T12:00:00.000Z'};state.detail.workingKeys=0;state.detail.activeElements=0;state.detail.clearElements=0;
 await page.goto(poolsPath);await expect(page.getByText('n/a',{exact:true})).toBeVisible();await page.getByRole('link',{name:'Reporting pool',exact:true}).click();await expect(page.locator('[data-part=expired-key-impact]')).toContainText('1 connected agent last authenticated with this key.');await expect(page.locator('[data-part=expired-key-impact]')).toContainText('reporter');
 state.empty=true;await page.reload();await expect(page.getByText('No agents seen yet',{exact:true})).toBeVisible();
 state.missing=true;await page.goto(twinPath);await expect(page.getByText('Agent not seen',{exact:true})).toBeVisible();await accessible(page);await page.goto(poolPath);await expect(page.getByText('Pool not found',{exact:true})).toBeVisible();await accessible(page);
});

for(const width of [390,900,1440])test(`Pool detail: expired-key facts stay inside keys card at ${width}`,async({page},info)=>{
 const state=await mockPools(page);state.detail.keys[0]={...state.detail.keys[0]!,state:'expired'};state.detail.workingKeys=0;
 await page.setViewportSize({width,height:1000});await page.goto(poolPath);
 const screen=page.locator('.screen.on'),card=screen.locator('.card').filter({has:page.getByRole('heading',{name:'Pool keys',exact:true})});
 await expect(card.locator('[data-part=expired-key-impact]')).toContainText('1 connected agent last authenticated with this key.');
 await expect(card.locator('[data-part=expired-key-impact]')).toContainText('1 previously seen · disconnected');
 await expect(screen.getByRole('heading')).toHaveText(['Reporting pool','Pool keys','Agents']);await expect(screen.getByText(version,{exact:true})).toHaveCount(0);
 const facts=await card.locator('[data-part=expired-key-impact]').evaluate(el=>{const r=el.getBoundingClientRect(),card=el.closest('.card')!.getBoundingClientRect();return {height:r.height,inside:r.top>=card.top&&r.bottom<=card.bottom};});expect(facts.inside).toBe(true);await info.attach('key-facts',{body:JSON.stringify({width,...facts}),contentType:'application/json'});await accessible(page);
});
test('Pool detail: zero key impact is one inline fact',async({page})=>{
 const state=await mockPools(page);const key={...state.detail.keys[0]!,state:'expired' as const};state.detail.keys=[key];state.detail.workingKeys=0;
 await page.route('**/affected-agents*',route=>route.fulfill({json:{...key,affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]}}));await page.goto(poolPath);
 const impact=page.locator('[data-part=expired-key-impact]');await expect(impact.getByText('No connected agents last authenticated with this key.',{exact:true})).toBeVisible();await expect(impact.locator('h1,h2,h3')).toHaveCount(0);await expect(impact.locator('p')).toHaveCount(1);await accessible(page);
});

for(const timezone of ['UTC','America/Toronto'])test(`Agent twin grace expiry renders a Timestamp at 390 in ${timezone}`,async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));const state=await mockPools(page);
 state.twin.keyMetadata={...state.twin.keyMetadata,state:'retiring',graceUntil:'2026-10-06T17:43:00Z'};
 await page.route('**/api/v1/me/settings',route=>route.fulfill({json:{email:'admin@example.com',fullName:'Admin',timezone,dateFormat:'YYYY-MM-DD',reducedMotion:true}}));
 await page.setViewportSize({width:390,height:1000});await page.goto(twinPath);
 const grace=page.locator('p').filter({hasText:'Grace ends'}),timestamp=grace.locator('time[data-part="timestamp"]');
 await expect(timestamp).toHaveAttribute('datetime','2026-10-06T17:43:00Z');
 await expect(timestamp.locator('[data-part="absolute"]')).toHaveText(timezone==='UTC'?'2026-10-06 17:43:00 UTC':'2026-10-06 13:43:00 EDT');
 await expect(timestamp.locator('[data-part="relative"]')).toHaveText('in 2 hours');
 await expect(page.getByText('[object Object]',{exact:false})).toHaveCount(0);
 const parts=await timestamp.evaluate(el=>{const body=el.closest('.sheetb')!.getBoundingClientRect();return [...el.children].map(part=>{const rect=part.getBoundingClientRect();return {lines:part.getClientRects().length,whiteSpace:getComputedStyle(part).whiteSpace,left:rect.left-body.left,right:rect.right-body.right};});});
 for(const part of parts){expect(part.lines).toBe(1);expect(part.whiteSpace).toBe('nowrap');expect(part.left).toBeGreaterThanOrEqual(0);expect(part.right).toBeLessThanOrEqual(0);}
 await accessible(page);
});
