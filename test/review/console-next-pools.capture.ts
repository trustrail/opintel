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
import {withPlatform,withTenant} from '../../src/platform/db/scope.js';
import {PostgresEvidenceWriter} from '../../src/modules/evidence/index.js';
import {PostgresNeedsYouReader} from '../../src/modules/tenancy/index.js';
import {TenancyListService} from '../../src/modules/tenancy/application/list-tenancy.js';
import {PostgresTenancyListRepository} from '../../src/modules/tenancy/infrastructure/tenancy-list-repository.js';
import {tenancyListRoutes} from '../../src/modules/tenancy/api/list-routes.js';
import {needsYouRoutes} from '../../src/modules/tenancy/api/needs-you-routes.js';
import {PostgresPoolReader,PostgresAgentPresence,AgentPresenceService} from '../../src/modules/pools/index.js';
import {poolReadRoutes} from '../../src/modules/pools/api/read-routes.js';
import {agentPresenceRoutes} from '../../src/modules/pools/api/presence-routes.js';
import {PostgresPoolTables,PoolKeyService,PostgresPoolKeys} from '../../src/modules/pools/index.js';
import {poolTableRoutes} from '../../src/modules/pools/api/table-routes.js';
import {poolKeyRoutes} from '../../src/modules/pools/api/key-routes.js';
import {catalogRoutes} from '../../src/modules/catalog/api/tree-routes.js';
import {PostgresCatalogTreeReader} from '../../src/modules/catalog/infrastructure/tree.js';
import {rowDecisionRoutes} from '../../src/modules/entitlements/api/row-routes.js';
import {PostgresRowDecisions} from '../../src/modules/entitlements/infrastructure/row-decisions.js';
it('reviews the four requested Pools completion captures with real API workflows',async()=>{
 const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();const hub=new RedisProjectHub(redis.client,process.env.REDIS_URL!);
 const f=await queryFixture(new PostgresEvidenceWriter(hub),{releaseCustody:true});onTestFinished(()=>f.close());
 await withPlatform(tx=>tx.query("UPDATE project SET name='Reinsurance demo' WHERE id=$1",[f.ctx.projectId]));
 expect((await f.query('SELECT field_1,field_2 FROM warehouse.public.records')).isError).not.toBe(true);
 const tables=new PostgresPoolTables(undefined,f.authorization),presence=new PostgresAgentPresence(hub),keys=new PoolKeyService(new PostgresPoolKeys(undefined,undefined,undefined,tables),presence);
 const routes=[...poolKeyRoutes(keys),...poolTableRoutes(tables),...rowDecisionRoutes(new PostgresRowDecisions()),...catalogRoutes(new PostgresCatalogTreeReader()),...entitlementReadRoutes(new PostgresEntitlementReader()),...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(),f.authorization)),...needsYouRoutes(new PostgresNeedsYouReader(),f.authorization),...poolReadRoutes(new PostgresPoolReader()),...agentPresenceRoutes(new AgentPresenceService(presence))];
 const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT object_id AS id FROM catalog_element WHERE id=$1',[f.ids[0]]));
 const api=createHttpServer(routes,{authorization:{currentUser:async()=>f.actor,port:f.authorization}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error('Missing API listener');
 const binding=await fetch(`http://127.0.0.1:${address.port}/api/v1/pools/${f.pool}/tables`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:f.ctx.projectId,tables:[object!.id],rowRule:{column:'field_1',operator:'=',value:1}})});expect(binding.status).toBe(200);
 const vite=await createViteServer({configFile:'src/console-next/vite.config.ts',server:{port:5174,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${address.port}`,changeOrigin:true}}}});await vite.listen();
 const browser=await chromium.connect('ws://127.0.0.1:9324/',{exposeNetwork:'<loopback>'}),directory='docs/review/console-backend/pools-fixes-screenshots';await mkdir(directory,{recursive:true});
 const errors:string[]=[],responses:Array<{path:string;method:string;status:number}>=[],screenshots:string[]=[];
 try{
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/'))responses.push({path:new URL(r.url()).pathname,method:r.request().method(),status:r.status()});});
  const base=`http://127.0.0.1:5174/?project=${f.ctx.projectId}&screen=pools`;
  for(const [view,width,height] of [['access',390,1500],['create',390,1500],['create',1440,1440],['all',1440,1180]] as const){
   await page.setViewportSize({width,height});await page.goto(`${base}&theme=light${view==='all'?'':`&pool=${f.pool}`}`);await page.getByRole('button',{name:'Choose pool'}).waitFor();await page.evaluate(()=>document.fonts.ready);
   if(view==='access')await page.locator('[data-access-list] li').first().waitFor();
   if(view==='all'){await page.locator('[data-all-pools] li').first().waitFor();expect(await page.locator('[data-pool-data]').count()).toBe(0);for(const badge of await page.locator('[data-waiting-count]').all())expect((await badge.innerText()).trim()).toMatch(/^\d+$/);}
   if(view==='create'){
    await page.getByRole('button',{name:'Choose pool'}).click();await page.getByRole('button',{name:'Create pool',exact:true}).click();await page.getByRole('textbox',{name:'Pool name'}).fill('Cedant 03');await page.locator('[data-source-option]').first().click();await page.locator('[data-table-picker] [role=checkbox]').first().click();await page.getByRole('button',{name:'Done',exact:true}).click();
    await page.getByRole('combobox',{name:'Row rule column'}).selectOption('field_1');await page.getByRole('spinbutton',{name:'Row rule value'}).fill('1');expect(await page.getByLabel('Value type',{exact:true}).count()).toBe(0);expect(await page.getByText(/I confirm/).count()).toBe(0);expect(await page.locator('[data-row-coverage] [data-status=ok]').count()).toBe(1);await page.locator('[data-limits] summary').click();await page.locator('[data-create-scroll]').evaluate(el=>{el.scrollTop=0;});
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.mouse.move(0,0);await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});
   const name=`pools-${view}-${width}-light.png`;await page.screenshot({path:`${directory}/${name}`,fullPage:true});screenshots.push(name);
  }
  await page.setViewportSize({width:1440,height:1180});
  await page.goto(`${base}&pool=${f.pool}&theme=light`);await page.getByRole('button',{name:'Set rows',exact:true}).first().waitFor();await page.keyboard.press('Tab');await page.getByRole('button',{name:'Set rows',exact:true}).first().focus();expect(await page.getByRole('button',{name:'Set rows',exact:true}).first().evaluate(el=>el.matches(':focus-visible')&&parseFloat(getComputedStyle(el).outlineWidth)>=2)).toBe(true);
  expect(await page.locator('[data-presence-dots] [data-agent-dot]').count()).toBe(1);expect(await page.locator('[data-presence-dots] [data-agent-dot]').first().getAttribute('data-binding')).toBe('claimed');expect(await page.locator('[data-pool-switch] [data-project-monogram] [data-kind]').count()).toBe(0);
  await page.locator('[data-kind=table]').first().hover();await page.getByRole('tooltip').waitFor();expect(await page.getByRole('tooltip').textContent()).toBe('table');await page.keyboard.press('Escape');await page.mouse.move(0,0);
  // Exercise real row mutation, labelled credential issuance, rotation and revocation.
  await page.goto(`${base}&pool=${f.pool}&theme=light`);await page.getByRole('button',{name:'Set rows',exact:true}).first().click();await page.getByRole('textbox',{name:'Row rule column'}).fill('field_1');await page.getByLabel('Value type',{exact:true}).selectOption('number');await page.getByRole('spinbutton',{name:'Row rule value'}).fill('1');await page.getByRole('button',{name:'Apply',exact:true}).click();await page.locator('[data-row-form]').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Grant access',exact:true}).click();await page.getByLabel('Credential label').fill('Review key');await page.getByRole('button',{name:'Issue credential',exact:true}).click();await page.getByRole('heading',{name:'Credential saved'}).waitFor();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('tab',{name:/Who can get in/}).click();await page.getByRole('button',{name:'Actions for Review key'}).click();await page.getByRole('menuitem',{name:'Rotate key…'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm rotation'}).click();await page.getByRole('heading',{name:'Credential saved'}).waitFor();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Actions for Review key'}).click();await page.getByRole('menuitem',{name:'Revoke credential…'}).click();await page.getByRole('textbox').fill('Review key');await page.getByRole('button',{name:'Confirm revocation'}).click();await page.getByRole('heading',{name:'Revoke credential',exact:true}).waitFor({state:'hidden'});
  // Creation accepts suggested threads by explicit submission, table setup and optional concurrency.
  await page.getByRole('button',{name:'Choose pool'}).click();await page.getByRole('button',{name:'Create pool',exact:true}).click();await page.getByRole('textbox',{name:'Pool name'}).fill('Review created pool');await page.locator('[data-source-option]').first().click();await page.locator('[data-table-picker] [role=checkbox]').first().click();await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('combobox',{name:'Row rule column'}).selectOption('field_1');await page.getByRole('spinbutton',{name:'Row rule value'}).fill('1');await page.locator('[data-limits] summary').click();await page.getByLabel('Queries at once',{exact:true}).fill('1');await page.getByRole('button',{name:'Create pool',exact:true}).click();await page.getByRole('heading',{name:'Credential saved'}).waitFor();await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Choose pool'}).getByText('Review created pool',{exact:true}).waitFor();
  expect(errors).toEqual([]);expect(responses.filter(r=>r.status>=400)).toEqual([]);
  await writeFile(`${directory}/capture.json`,JSON.stringify({capturedAt:new Date().toISOString(),fixture:'Real PostgreSQL projections, real Engine request, real pool commands, real SpiceDB permissions; fixture supplies authentication only.',screenshots,keyboardFocusVisible:true,kindHoverVerified:true,reducedMotion:'reduce; no independent chart animation',connectedDefinition:'Fresh connecting, active or idle presence states; all pages read; not PoolSummary.agents or activeAgents.',realWritesVerified:['table row rule','issue labelled credential','rotate with confirmation','revoke with confirmation','create table-scoped pool with suggested threads, scanned column type and optional concurrency'],pageErrors:errors,apiResponses:responses},null,2)+'\n');await context.close();
 }finally{await browser.close();await vite.close();api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));await hub.close();await redis.close();await f.close();}
});
