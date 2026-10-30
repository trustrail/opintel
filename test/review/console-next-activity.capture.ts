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
import {createHttpServer} from '../../src/platform/http/index.js';
import {queryFixture,unwrap} from '../fixtures/query/fixture.js';
import {withTenant} from '../../src/platform/db/scope.js';
import {PostgresEvidenceWriter} from '../../src/modules/evidence/index.js';
import {PostgresNeedsYouReader} from '../../src/modules/tenancy/index.js';
import {TenancyListService} from '../../src/modules/tenancy/application/list-tenancy.js';
import {PostgresTenancyListRepository} from '../../src/modules/tenancy/infrastructure/tenancy-list-repository.js';
import {tenancyListRoutes} from '../../src/modules/tenancy/api/list-routes.js';
import {needsYouRoutes} from '../../src/modules/tenancy/api/needs-you-routes.js';
import {PostgresPoolReader,PostgresAgentPresence,AgentPresenceService} from '../../src/modules/pools/index.js';
import {poolReadRoutes} from '../../src/modules/pools/api/read-routes.js';
import {agentPresenceRoutes} from '../../src/modules/pools/api/presence-routes.js';
import {PostgresPoolTables} from '../../src/modules/pools/index.js';
import {poolTableRoutes} from '../../src/modules/pools/api/table-routes.js';
import {rowDecisionRoutes} from '../../src/modules/entitlements/api/row-routes.js';
import {PostgresRowDecisions} from '../../src/modules/entitlements/infrastructure/row-decisions.js';
import {projectStreamRoutes} from '../../src/platform/sse/routes.js';
import {evidenceRoutes} from '../../src/modules/evidence/api/routes.js';
import {EvidenceQuery,PostgresEvidenceReader,DuckDBEvidenceText} from '../../src/modules/evidence/index.js';
import {ActivitySummary} from '../../src/shared/api/activity.js';
it('captures Activity with actual requests, recorded receipts, summary buckets and project stream',async()=>{
 const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();const hub=new RedisProjectHub(redis.client,process.env.REDIS_URL!);
 const f=await queryFixture(new PostgresEvidenceWriter(hub),{releaseCustody:true});onTestFinished(()=>f.close());
 const tables=new PostgresPoolTables(undefined,f.authorization),presence=new PostgresAgentPresence(hub),evidence=new EvidenceQuery(new PostgresEvidenceReader(),f.authorization,new DuckDBEvidenceText());
 const routes=[...poolTableRoutes(tables),...rowDecisionRoutes(new PostgresRowDecisions()),...entitlementReadRoutes(new PostgresEntitlementReader()),...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(),f.authorization)),...needsYouRoutes(new PostgresNeedsYouReader(),f.authorization),...poolReadRoutes(new PostgresPoolReader()),...agentPresenceRoutes(new AgentPresenceService(presence)),...evidenceRoutes(evidence),...projectStreamRoutes(hub)];
 const api=createHttpServer(routes,{authorization:{currentUser:async()=>f.actor,port:f.authorization}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error('Missing API listener');
 const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT object_id AS id FROM catalog_element WHERE id=$1',[f.ids[0]]));
 const binding=await fetch(`http://127.0.0.1:${address.port}/api/v1/pools/${f.pool}/tables`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:f.ctx.projectId,tables:[object!.id],rowRule:{column:'field_1',operator:'>=',value:1}})});expect(binding.status).toBe(200);
 expect((await f.query('SELECT field_1,field_2 FROM warehouse.public.records')).isError).not.toBe(true);
 expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);
 await f.query('SELECT SUM(field_3) FROM warehouse.public.records WHERE field_1=1');
 expect((await f.query('SELECT field_5 FROM warehouse.public.records')).isError).toBe(true);
 // Real fixture custody and a real Engine query; no values are persisted by the console.
 await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
 expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);
 const initial=unwrap(await evidence.list(f.ctx,{},null,100)),answered=initial.find(r=>r.status==='answered'&&r.metadata.delivered.custody),refused=initial.find(r=>r.status==='refused'&&r.metadata.objects?.length)??initial.find(r=>r.status==='refused');expect(answered).toBeDefined();expect(refused).toBeDefined();
 const vite=await createViteServer({configFile:'src/console-next/vite.config.ts',server:{port:5174,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${address.port}`,changeOrigin:true}}}});await vite.listen();
 const browser=await chromium.connect('ws://127.0.0.1:9324/',{exposeNetwork:'<loopback>'}),directory='docs/review/console-backend/activity-screenshots';await mkdir(directory,{recursive:true});const errors:string[]=[],responses:Array<{path:string;status:number}>=[],screenshots:string[]=[];
 try{
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/'))responses.push({path:new URL(r.url()).pathname,status:r.status()});});
  const base=`http://127.0.0.1:5174/?project=${f.ctx.projectId}&screen=activity&theme=light`;
  for(const [view,width,height] of [['answered',1440,1180],['refused',1440,1180],['list',390,1100],['sheet',390,1100]] as const){
   await page.setViewportSize({width,height});await page.goto(base);await page.getByRole('button',{name:'Choose pool'}).waitFor();await page.locator('[data-request-row]').first().waitFor();await expect.poll(()=>page.locator('[data-activity-live] [data-live=true]').count()).toBe(1);await page.evaluate(()=>document.fonts.ready);
   if(view==='refused')await page.getByRole('button',{name:/Refused/}).click();
   if(view!=='list'){const id=view==='refused'?refused!.id:answered!.id;await page.locator(`[data-request-row][data-run-id="${id}"]`).click();await page.locator('[data-receipt-heading]').waitFor();await expect.poll(()=>page.locator('[data-activity-receipt]').innerText()).not.toContain('Loading recorded row rule');}
   if(view==='sheet'){expect(await page.locator('[data-activity-receipt]').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight)<2)).toBe(true);}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.mouse.move(0,0);const name=`activity-${view}-${width}-light.png`;await page.screenshot({path:`${directory}/${name}`,fullPage:width===1440});screenshots.push(name);
  }
  await page.keyboard.press('Escape');await page.goto(base);const first=page.locator('[data-request-row]').first();await first.focus();expect(await first.evaluate(el=>el.matches(':focus-visible')&&parseFloat(getComputedStyle(el).outlineWidth)>=2)).toBe(true);
  // A completion on the existing stream must update the summary, without waiting for polling.
  const summaryUrl=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/runs/summary`,before=ActivitySummary.parse(await(await fetch(summaryUrl)).json()).counts.all;expect((await f.query('SELECT field_4 FROM warehouse.public.records')).isError).not.toBe(true);await expect.poll(()=>page.locator('[data-pool-band]>header').innerText()).toContain(`${before+1} requests today`);
  expect(errors).toEqual([]);expect(responses.filter(r=>r.status>=400)).toEqual([]);
  await writeFile(`${directory}/capture.json`,JSON.stringify({capturedAt:new Date().toISOString(),fixture:'Actual Engine/MCP requests including custody and refusals, PostgreSQL evidence projections, immutable row decisions, real SpiceDB permissions and Redis project stream. Authentication only is supplied by fixture.',screenshots,keyboardFocusVisible:true,reducedMotion:'reduce',completionUpdatedBand:true,pageErrors:errors,apiResponses:responses},null,2)+'\n');await context.close();
 }finally{await browser.close();await vite.close();api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));await hub.close();await redis.close();await f.close();}
});
