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
import {sourceRoutes} from '../../src/modules/sources/api/source-routes.js';
import {SourceRegistrationService} from '../../src/modules/sources/application/source-registration.js';
import {PostgresSourceRegistrationRepository} from '../../src/modules/sources/infrastructure/source-registration-repository.js';
import {IntrospectionJob,PostgresIntrospectionStore} from '../../src/modules/sources/index.js';
import {UuidV7IdFactory} from '../../src/shared/kernel/index.js';
import {suggestionRoutes} from '../../src/modules/relationships/api/routes.js';
import {PostgresSuggestions} from '../../src/modules/relationships/infrastructure/review.js';
import {EvidenceQuery,PostgresEvidenceReader} from '../../src/modules/evidence/index.js';
import {DuckDBQueryParser,BulkEntitlementService,PostgresBulkEntitlements} from '../../src/modules/entitlements/index.js';
import {bulkEntitlementRoutes} from '../../src/modules/entitlements/api/bulk-routes.js';
it('captures Data using real catalogue, source, entitlement and suggestion routes',async()=>{
 const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();const hub=new RedisProjectHub(redis.client,process.env.REDIS_URL!);
 const f=await queryFixture(new PostgresEvidenceWriter(hub),{releaseCustody:true});onTestFinished(()=>f.close());
 await withPlatform(tx=>tx.query("UPDATE project SET name='Reinsurance demo' WHERE id=$1",[f.ctx.projectId]));
 const stats=await f.db('SELECT reltuples::float8 AS estimate FROM pg_class WHERE oid=$1::regclass',[`${f.schema}.records`]);
 await withTenant(f.ctx,tx=>tx.query('UPDATE catalog_object SET row_estimate=$2 WHERE source_id=$1',[f.source,stats.rows[0]!.estimate]));
 const tables=new PostgresPoolTables(undefined,f.authorization),presence=new PostgresAgentPresence(hub),keys=new PoolKeyService(new PostgresPoolKeys(undefined,undefined,undefined,tables),presence);
 // Screens read real source projections. No scan/registration command is issued by this review capture.
 const ids=new UuidV7IdFactory(),store=new PostgresIntrospectionStore(ids),connector=()=>{throw new Error('Scanning is outside this read-only capture');},jobs=new IntrospectionJob(store,connector),sources=new SourceRegistrationService(new PostgresSourceRegistrationRepository(),ids,connector,jobs,async(ctx,id,message)=>{await store.advance(ctx,id,'queued','connecting');await store.fail(ctx,id,message,false);});
 const suggestions=new PostgresSuggestions(new EvidenceQuery(new PostgresEvidenceReader(),f.authorization,new DuckDBQueryParser()));
 const routes=[...sourceRoutes(sources),...suggestionRoutes(suggestions),...bulkEntitlementRoutes(new BulkEntitlementService(new PostgresBulkEntitlements())),...poolKeyRoutes(keys),...poolTableRoutes(tables),...rowDecisionRoutes(new PostgresRowDecisions()),...catalogRoutes(new PostgresCatalogTreeReader()),...entitlementReadRoutes(new PostgresEntitlementReader()),...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(),f.authorization)),...needsYouRoutes(new PostgresNeedsYouReader(),f.authorization),...poolReadRoutes(new PostgresPoolReader()),...agentPresenceRoutes(new AgentPresenceService(presence))];
 const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT object_id AS id FROM catalog_element WHERE id=$1',[f.ids[0]]));
 const api=createHttpServer(routes,{authorization:{currentUser:async()=>f.actor,port:f.authorization}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error('Missing API listener');
 const vite=await createViteServer({configFile:'src/console-next/vite.config.ts',server:{port:5174,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${address.port}`,changeOrigin:true}}}});await vite.listen();
 const browser=await chromium.connect('ws://127.0.0.1:9324/',{exposeNetwork:'<loopback>'}),directory='docs/review/console-backend/data-screenshots';await mkdir(directory,{recursive:true});
 const errors:string[]=[],responses:Array<{path:string;method:string;status:number}>=[],screenshots:string[]=[];
 try{
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/'))responses.push({path:new URL(r.url()).pathname,method:r.request().method(),status:r.status()});});
  const base=`http://127.0.0.1:5174/?project=${f.ctx.projectId}&screen=data&theme=light`;
  for(const [view,width,height] of [['entitlements',1440,1180],['columns',1440,1180],['sources',1440,1180],['suggestions',1440,1180],['entitlements',390,1500],['columns',390,1500]] as const){
   await page.setViewportSize({width,height});await page.goto(`${base}${view==='columns'?`&source=${f.source}&table=${object!.id}`:view==='sources'||view==='suggestions'?`&tab=${view}${view==='suggestions'?`&source=${f.source}`:''}`:''}`);await page.getByRole('button',{name:'Choose source'}).waitFor();await page.evaluate(()=>document.fonts.ready);
   if(view==='entitlements')await page.locator('[data-data-table-row]').first().waitFor();
   if(view==='columns'){await page.locator('[data-treatment-cell]').first().waitFor();await page.locator(`[data-treatment-cell][data-element-id="${f.ids[5]}"][data-pool-id="${f.pool}"]`).click();await page.getByRole('button',{name:'Clear',exact:true}).waitFor();}
   if(view==='sources'){await page.locator('[data-source-name]').first().waitFor();await page.getByRole('button',{name:'Choose source'}).click();await page.locator('[data-pool-picker]').waitFor();}
   if(view==='suggestions')await page.getByRole('heading',{name:'Nothing to review'}).waitFor();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   await page.mouse.move(0,0);await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});
   const name=`data-${view}-${width}-light.png`;await page.screenshot({path:`${directory}/${name}`,fullPage:true});screenshots.push(name);
  }
  await page.setViewportSize({width:1440,height:1180});await page.goto(`${base}&table=${object!.id}`);const cell=page.locator(`[data-treatment-cell][data-element-id="${f.ids[5]}"][data-pool-id="${f.pool}"]`);await cell.focus();expect(await cell.evaluate(el=>el.matches(':focus-visible')&&parseFloat(getComputedStyle(el).outlineWidth)>=2)).toBe(true);await cell.click();await page.getByRole('button',{name:'Withhold',exact:true}).click();await page.locator('[data-treatment-picker]').waitFor({state:'hidden'});await page.waitForFunction(({element,pool})=>document.querySelector(`[data-treatment-cell][data-element-id="${element}"][data-pool-id="${pool}"]`)?.getAttribute('aria-label')?.includes('withheld'),{element:f.ids[5],pool:f.pool});
  await page.goto(base);await page.getByRole('button',{name:'Choose source'}).click();await page.getByRole('button',{name:/Warehouse 1 table/}).click();await page.locator('[data-pool-band] header').getByText('Warehouse only').waitFor();await page.getByRole('tab',{name:/Sources/}).click();expect(await page.locator('[data-source-name]').count()).toBe(1);await page.goto(base);await page.getByRole('link',{name:'View decided'}).click();await page.locator('[data-data-toolbar]').getByText(/Clear filter/).waitFor();
  expect(errors).toEqual([]);expect(responses.filter(r=>r.status>=400)).toEqual([]);
  await writeFile(`${directory}/capture.json`,JSON.stringify({capturedAt:new Date().toISOString(),fixture:'Real PostgreSQL catalogue and source projections, real SpiceDB permissions and real bulk treatment command. Authentication supplied by fixture; source scan/registration not executed in capture. Stored estimate read from pg_class.reltuples after fixture ANALYZE, never COUNT(*).',screenshots,keyboardFocusVisible:true,reducedMotion:'reduce; no independent chart animation',realWritesVerified:['Withhold undecided field in one pool'],bandFilterVerified:true,pageErrors:errors,apiResponses:responses},null,2)+'\n');await context.close();
 }finally{await browser.close();await vite.close();api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));await sources.close();await hub.close();await redis.close();await f.close();}
});
