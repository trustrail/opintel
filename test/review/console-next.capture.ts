import {entitlementReadRoutes} from '../../src/modules/entitlements/api/read-routes.js';
import {PostgresEntitlementReader} from '../../src/modules/entitlements/index.js';
// Manual review capture only. Never part of the normal gate or historical pixels.
import {it,expect,onTestFinished} from 'vitest';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer as createViteServer} from 'vite';
import {chromium} from '@playwright/test';
import {createRedisConnection} from '../../src/platform/redis/index.js';
import {RedisProjectHub} from '../../src/platform/sse/redis-hub.js';
import {projectStreamRoutes} from '../../src/platform/sse/routes.js';
import {createHttpServer} from '../../src/platform/http/index.js';
import {queryFixture,unwrap} from '../fixtures/query/fixture.js';
import {withPlatform} from '../../src/platform/db/scope.js';
import {PostgresEvidenceWriter,PostgresEvidenceReader,EvidenceQuery,DuckDBEvidenceText} from '../../src/modules/evidence/index.js';
import {PostgresDashboardReader,PostgresNeedsYouReader,PostgresProjectHealthReader} from '../../src/modules/tenancy/index.js';
import {TenancyListService} from '../../src/modules/tenancy/application/list-tenancy.js';
import {PostgresTenancyListRepository} from '../../src/modules/tenancy/infrastructure/tenancy-list-repository.js';
import {tenancyListRoutes} from '../../src/modules/tenancy/api/list-routes.js';
import {dashboardRoutes} from '../../src/modules/tenancy/api/dashboard-routes.js';
import {needsYouRoutes} from '../../src/modules/tenancy/api/needs-you-routes.js';
import {projectHealthRoutes} from '../../src/modules/tenancy/api/project-health-routes.js';
import {evidenceRoutes} from '../../src/modules/evidence/api/routes.js';
import {PostgresPoolReader,PostgresAgentPresence,AgentPresenceService} from '../../src/modules/pools/index.js';
import {poolReadRoutes} from '../../src/modules/pools/api/read-routes.js';
import {agentPresenceRoutes} from '../../src/modules/pools/api/presence-routes.js';
it('captures Home from real PostgreSQL projections, real engine queries and Redis SSE at four review viewports',async()=>{
 const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();const hub=new RedisProjectHub(redis.client,process.env.REDIS_URL!);
 const f=await queryFixture(new PostgresEvidenceWriter(hub),{releaseCustody:true});onTestFinished(()=>f.close());
 await withPlatform(tx=>tx.query("UPDATE project SET name='Reinsurance demo' WHERE id=$1",[f.ctx.projectId]));
 // These are executed requests, not injected UI numbers.
 for(let i=0;i<6;i++)expect((await f.query('SELECT field_1,field_2 FROM warehouse.public.records')).isError).not.toBe(true);
 expect((await f.query('SELECT field_5 FROM warehouse.public.records')).isError).toBe(true);
 const routes=[...entitlementReadRoutes(new PostgresEntitlementReader()),...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(),f.authorization)),...dashboardRoutes(new PostgresDashboardReader()),...needsYouRoutes(new PostgresNeedsYouReader(),f.authorization),...projectHealthRoutes(new PostgresProjectHealthReader()),...evidenceRoutes(new EvidenceQuery(new PostgresEvidenceReader(),f.authorization,new DuckDBEvidenceText())),...poolReadRoutes(new PostgresPoolReader()),...agentPresenceRoutes(new AgentPresenceService(new PostgresAgentPresence(hub))),...projectStreamRoutes(hub)];
 const api=createHttpServer(routes,{authorization:{currentUser:async()=>f.actor,port:f.authorization}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error('Missing API listener');
 const vite=await createViteServer({configFile:'src/console-next/vite.config.ts',server:{port:5174,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${address.port}`,changeOrigin:true}}}});await vite.listen();
 const browser=await chromium.connect('ws://127.0.0.1:9324/',{exposeNetwork:'<loopback>'});
 const directory='docs/review/console-backend/phase1-screenshots';await mkdir(directory,{recursive:true});
 const expectedNeeds=unwrap(await new PostgresNeedsYouReader().read(f.ctx,true,null,100)).length;
 const errors:string[]=[],responses:Array<{url:string;status:number}>=[];
 try{
  const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/'))responses.push({url:new URL(r.url()).pathname,status:r.status()});});
  for(const [width,height] of [[1440,1000],[390,1500]] as const){
   await page.setViewportSize({width,height});
   for(const theme of ['light','dark']){
    await page.goto(`http://127.0.0.1:5174/?project=${f.ctx.projectId}&theme=${theme}`);
    await page.getByRole('heading',{name:/Needs you/}).waitFor();await page.locator('[data-health-icon][aria-label^="TLS certificate:"]').waitFor({state:'attached'});await expect.poll(()=>page.locator('[data-live=true]').count()).toBeGreaterThan(0);await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect(await page.locator('[data-needs-row]').count()).toBe(expectedNeeds);
    const queue=page.getByRole('region',{name:'Needs-you items'});
    if(width===390){
     expect(await page.locator('[data-needs-row]:visible').count()).toBe(Math.min(5,expectedNeeds));
     expect(await queue.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
     const more=page.getByRole('button',{name:`${expectedNeeds-5} more`,exact:true});await more.click();
     expect(await page.locator('[data-needs-row]:visible').count()).toBe(expectedNeeds);expect(await queue.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
    }else{
     expect(await queue.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);expect(await page.locator('[data-needs-more]').isVisible()).toBe(false);
    }
    await page.keyboard.press('Tab');await page.locator('[data-needs-row]').last().focus();const focus=await page.locator('[data-needs-row]').last().evaluate(el=>({visible:el.matches(':focus-visible'),width:parseFloat(getComputedStyle(el).outlineWidth),style:getComputedStyle(el).outlineStyle}));expect(focus.visible).toBe(true);expect(focus.width).toBeGreaterThanOrEqual(2);expect(focus.style).toBe('solid');
    const bounds=await queue.boundingBox(),last=await page.locator('[data-needs-row]').last().boundingBox();expect(last!.y).toBeGreaterThanOrEqual(bounds!.y-1);expect(last!.y+last!.height).toBeLessThanOrEqual(bounds!.y+bounds!.height+1);
    if(width===390){await page.getByRole('button',{name:'Show fewer',exact:true}).click();expect(await page.locator('[data-needs-row]:visible').count()).toBe(5);}
    await queue.evaluate(el=>{el.scrollTop=0;});await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});
    expect(await page.locator('[data-need-effect]').count()).toBe(0);expect(await page.locator('[data-needs]').textContent()).not.toContain('—');
    for(const name of ['Pools','Data','Settings'])expect(await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name}).locator('[data-attention]').count()).toBe(1);
    if(width===1440){const check=page.locator('[data-health-icon][data-status=warning]').first();await check.hover();await page.getByRole('tooltip').waitFor();expect(await page.getByRole('tooltip').textContent()).toMatch(/verification|check|initialized/);}
    await page.keyboard.press('Escape');await page.mouse.move(100,800);if(width===1440){await page.getByRole('tooltip').waitFor({state:'hidden'});await page.locator('[data-kind=table]').first().hover();await page.getByRole('tooltip').waitFor();expect(await page.getByRole('tooltip').textContent()).toBe('table');await page.keyboard.press('Escape');await page.mouse.move(100,800);await page.getByRole('tooltip').waitFor({state:'hidden'});}

    if(width===390){for(const link of await page.locator('[data-rail] nav a').all()){const box=await link.boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.y+box!.height).toBeLessThanOrEqual(height);}}
    if(width===390)await page.screenshot({path:`${directory}/home-${width}-${theme}.png`,fullPage:true});
   }
  }
  // Persisting a new completion updates the band through the actual stream.
  await page.setViewportSize({width:1440,height:1000});await page.goto(`http://127.0.0.1:5174/?project=${f.ctx.projectId}`);await page.getByRole('link',{name:'7 Requests, today UTC'}).waitFor();
  expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);await page.getByRole('link',{name:'8 Requests, today UTC'}).waitFor();
  await page.getByText('field_6',{exact:true}).first().click();await page.locator('[data-need-effect]').waitFor();expect(await page.locator('[data-need-effect]').textContent()).toContain('hidden until treated');expect(await page.locator('[data-need-effect]').evaluate(el=>el.getAnimations().length)).toBe(0);await page.locator('[data-needs-row][aria-expanded=true]').click();expect(await page.locator('[data-need-effect]').count()).toBe(0);
  await page.getByRole('tab',{name:'Decisions first'}).click();await page.getByRole('link',{name:'2 Clear'}).first().click();await page.getByRole('heading',{name:'Clear columns',exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'0 custody grants, today UTC'}).click();await page.getByText('No receipts with custody grants today.').waitFor();await page.keyboard.press('Escape');
  const agents=await page.locator('[data-number]').last().getAttribute('aria-label');await page.getByRole('button',{name:agents!}).click();await page.getByRole('heading',{name:'Agents connected now',exact:true}).waitFor();await expect.poll(()=>page.locator('[data-connected-agents] a').count()).toBeGreaterThan(0);await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.getByText('field_6',{exact:true}).first().click();await page.locator('[data-need-effect]').waitFor();await page.waitForTimeout(250);await page.locator('[data-needs-row][aria-expanded=true]').click();
  await hub.close();await page.getByText('Polling · 15 s').waitFor();
  await context.close();expect(errors).toEqual([]);expect(responses.filter(r=>r.status>=400)).toEqual([]);
  const stats=unwrap(await new PostgresDashboardReader().stats(f.ctx));await writeFile(`${directory}/capture.json`,JSON.stringify({capturedAt:new Date().toISOString(),fixture:'Isolated test database; real PostgreSQL read models, real Engine requests and Redis SSE. Authentication supplied by the fixture, not production credentials.',viewportPairs:[[1440,1000],[390,1500]],screenshotsCaptured:[[390,1500]],phoneInitialItems:5,phoneMoreItems:expectedNeeds-5,phoneExpandsInPlace:true,desktopInnerScroll:true,queueItems:expectedNeeds,allQueueRowsReachable:true,attentionAreas:['Pools','Data','Settings'],reducedMotion:'reduce',keyboardFocusVisible:true,kindHoverVerified:true,healthReasonHoverVerified:true,bandFiltersVerified:true,requestsAtCapture:7,requestsAfterLiveCheck:stats.requests,apiResponses:responses,pageErrors:errors},null,2)+'\n');
 }finally{await browser.close();await vite.close();api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));await hub.close();await redis.close();await f.close();}
});
