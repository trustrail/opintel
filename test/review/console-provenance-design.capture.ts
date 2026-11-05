import {QueryOutput} from '../../src/shared/api/mcp.js';
// Manual CONSOLE-04 review; isolated fixtures, real routes, no production data.
import {entitlementReadRoutes} from '../../src/modules/entitlements/api/read-routes.js';
import {BulkEntitlementService,DuckDBQueryParser,KeyCustodyService,PostgresBulkEntitlements,PostgresCustodyRepository,PostgresEntitlementReader} from '../../src/modules/entitlements/index.js';
import {expect,it,onTestFinished} from 'vitest';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {preview} from 'vite';
import {chromium} from '@playwright/test';
import {createRedisConnection} from '../../src/platform/redis/index.js';
import {RedisProjectHub} from '../../src/platform/sse/redis-hub.js';
import {projectStreamRoutes} from '../../src/platform/sse/routes.js';
import {createHttpServer,defineRoute} from '../../src/platform/http/index.js';
import {queryFixture,unwrap} from '../fixtures/query/fixture.js';
import {withPlatform,withTenant} from '../../src/platform/db/scope.js';
import {DuckDBEvidenceText,EvidenceQuery,PostgresEvidenceReader,PostgresEvidenceWriter} from '../../src/modules/evidence/index.js';
import {PostgresDashboardReader,PostgresNeedsYouReader,PostgresProjectHealthReader,PostgresSettings} from '../../src/modules/tenancy/index.js';
import {TenancyListService} from '../../src/modules/tenancy/application/list-tenancy.js';
import {PostgresTenancyListRepository} from '../../src/modules/tenancy/infrastructure/tenancy-list-repository.js';
import {tenancyListRoutes} from '../../src/modules/tenancy/api/list-routes.js';
import {dashboardRoutes} from '../../src/modules/tenancy/api/dashboard-routes.js';
import {needsYouRoutes} from '../../src/modules/tenancy/api/needs-you-routes.js';
import {projectHealthRoutes} from '../../src/modules/tenancy/api/project-health-routes.js';
import {evidenceRoutes} from '../../src/modules/evidence/api/routes.js';
import {AgentPresenceService,PoolKeyService,PostgresAgentPresence,PostgresPoolKeys,PostgresPoolReader,PostgresPoolTables} from '../../src/modules/pools/index.js';
import {poolReadRoutes} from '../../src/modules/pools/api/read-routes.js';
import {agentPresenceRoutes} from '../../src/modules/pools/api/presence-routes.js';
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
import {SystemClock,UuidV7IdFactory} from '../../src/shared/kernel/index.js';
import {suggestionRoutes} from '../../src/modules/relationships/api/routes.js';
import {PostgresSuggestions} from '../../src/modules/relationships/infrastructure/review.js';
import {bulkEntitlementRoutes} from '../../src/modules/entitlements/api/bulk-routes.js';
import {settingsRoutes} from '../../src/modules/tenancy/api/settings-routes.js';
import {memberRoutes} from '../../src/modules/tenancy/api/member-routes.js';
import {ListMembersService} from '../../src/modules/tenancy/application/list-members.js';
import {PostgresMemberListRepository} from '../../src/modules/tenancy/infrastructure/member-list-repository.js';
import {invitationRoutes} from '../../src/modules/tenancy/api/invitation-routes.js';
import {InvitationService} from '../../src/modules/tenancy/application/invitations.js';
import {PostgresInvitationRepository} from '../../src/modules/tenancy/infrastructure/invitation-repository.js';
import {RelationshipOutbox} from '../../src/modules/tenancy/application/relationship-outbox.js';
import {releaseRoutes} from '../../src/modules/release-custody/index.js';
import {EngineRegistry,HttpsEngineProbe,PostgresEngineRepository,RegistryCustodyClient,engineRoutes} from '../../src/modules/engines/index.js';
import {keyCustodyRoutes} from '../../src/modules/entitlements/api/key-custody-routes.js';
import {z} from 'zod';
import {industryRoutes} from '../../src/modules/vocabulary/api/industry-routes.js';
import {ListIndustriesService} from '../../src/modules/vocabulary/application/list-industries.js';
import {PostgresIndustryListRepository} from '../../src/modules/vocabulary/infrastructure/industry-list-repository.js';
it('CONSOLE-04b records the design sweep with real API projections',async()=>{
 const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();const hub=new RedisProjectHub(redis.client,process.env.REDIS_URL!);
 const f=await queryFixture(new PostgresEvidenceWriter(hub),{releaseCustody:true});onTestFinished(()=>f.close());if(!f.release)throw new Error('Custody fixture required');
 await withPlatform(tx=>tx.query("UPDATE project SET name='Review project' WHERE id=$1",[f.ctx.projectId]));
 await withPlatform(tx=>tx.query("UPDATE user_account SET full_name='Review administrator' WHERE id=$1",[f.ctx.userId]));
 const tables=new PostgresPoolTables(undefined,f.authorization),presence=new PostgresAgentPresence(hub),keys=new PoolKeyService(new PostgresPoolKeys(undefined,undefined,undefined,tables),presence);
 const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT object_id AS id FROM catalog_element WHERE id=$1',[f.ids[0]]));unwrap(await tables.add(f.ctx,f.pool,[object!.id as Parameters<typeof tables.add>[2][number]],{allRows:true}));
 await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
 const answer=await f.query('SELECT field_1,field_2 FROM warehouse.public.records');expect(answer.isError).not.toBe(true);const receipt=QueryOutput.parse(answer.structuredContent).evidenceId;
 const refused=await f.query('SELECT field_5 FROM warehouse.public.records');expect(refused.isError).toBe(true);
 const ids=new UuidV7IdFactory(),store=new PostgresIntrospectionStore(ids),connector=()=>{throw new Error('No scan in a review capture');},jobs=new IntrospectionJob(store,connector),sources=new SourceRegistrationService(new PostgresSourceRegistrationRepository(),ids,connector,jobs,async(ctx,id,message)=>{await store.advance(ctx,id,'queued','connecting');await store.fail(ctx,id,message,false);});
 const suggestions=new PostgresSuggestions(new EvidenceQuery(new PostgresEvidenceReader(),f.authorization,new DuckDBQueryParser()));
 const registry=new EngineRegistry(new PostgresEngineRepository(),new HttpsEngineProbe(),f.engineTls),custody=new KeyCustodyService(new PostgresCustodyRepository(),new RegistryCustodyClient(registry),f.authorization);
 const invitations=new InvitationService(new PostgresInvitationRepository(new RelationshipOutbox()),f.authorization,new SystemClock(),{dispatch:async()=>{}}),settings=new PostgresSettings(f.release);
 const routes=[...settingsRoutes(settings),...industryRoutes(new ListIndustriesService(new PostgresIndustryListRepository())),...projectHealthRoutes(new PostgresProjectHealthReader()),...releaseRoutes(f.release),...engineRoutes(registry),...keyCustodyRoutes(custody),...memberRoutes(new ListMembersService(new PostgresMemberListRepository())),...invitationRoutes(invitations),...sourceRoutes(sources),...suggestionRoutes(suggestions),...bulkEntitlementRoutes(new BulkEntitlementService(new PostgresBulkEntitlements())),...poolKeyRoutes(keys),...poolTableRoutes(tables),...rowDecisionRoutes(new PostgresRowDecisions()),...catalogRoutes(new PostgresCatalogTreeReader()),...entitlementReadRoutes(new PostgresEntitlementReader()),...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(),f.authorization)),...needsYouRoutes(new PostgresNeedsYouReader(),f.authorization),...poolReadRoutes(new PostgresPoolReader()),...agentPresenceRoutes(new AgentPresenceService(presence)),...dashboardRoutes(new PostgresDashboardReader()),...evidenceRoutes(new EvidenceQuery(new PostgresEvidenceReader(),f.authorization,new DuckDBEvidenceText())),...projectStreamRoutes(hub),defineRoute({method:'GET',path:'/api/v1/auth/me',permission:'authenticated',params:z.object({}),request:z.undefined(),response:z.object({email:z.email()}),handle:async()=>({body:{email:f.actor.email}})})];
 const api=createHttpServer(routes,{authorization:{currentUser:async()=>f.actor,port:f.authorization}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error('Missing review listener');
 const vite=await preview({configFile:'src/console-next/vite.config.ts',preview:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'^/api/':{target:`http://127.0.0.1:${address.port}`,changeOrigin:true}}}});
 const browser=await chromium.connect(process.env.OPINTEL_REVIEW_BROWSER_WS!,{exposeNetwork:'<loopback>'}),directory='docs/review/console-provenance-design';await mkdir(directory,{recursive:true});
 const errors:string[]=[],responses:Array<{path:string;status:number}>=[],screenshots:string[]=[],layout:Array<{screen:string;viewport:number;overflow:number;identifierTargets:Array<{width:number;height:number;truncated:boolean;whiteSpace:string;overflowStyle:string}>}>=[];
 try{const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')errors.push(r.url()+' '+r.failure()?.errorText);});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{responses.push({path:new URL(r.url()).pathname,status:r.status()});});
 const historical=ids.create<string>();const historicalAt=new Date().toISOString();
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO query_run(id,project_id,pool_id,agent_id,key_prefix,mode,versions,started_at) VALUES($1,$2,$3,'historical-agent','opk_review','query',$4,$5)",[historical,f.ctx.projectId,f.pool,{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:1},historicalAt]));
 const [refusedRun]=await withTenant(f.ctx,tx=>tx.query<{id:string}>("SELECT q.id FROM query_run q JOIN run_completion c ON c.run_id=q.id AND c.started_at=q.started_at WHERE q.project_id=$1 AND c.outcome->>'kind'='refused' ORDER BY q.started_at DESC LIMIT 1",[f.ctx.projectId]));
 if(!refusedRun)throw new Error('Missing refused fixture receipt');
 const emptyPool=ids.create<string>();await withTenant(f.ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Empty custody pool')",[emptyPool,f.ctx.projectId]));
 const capture=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);layout.push(await page.evaluate(screen=>({screen,viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,identifierTargets:Array.from(document.querySelectorAll('[data-copy-identifier]')).map(el=>{const rect=el.getBoundingClientRect();const code=el.querySelector('code');return {width:rect.width,height:rect.height,truncated:!!code&&code.scrollWidth>code.clientWidth,whiteSpace:code?getComputedStyle(code).whiteSpace:'',overflowStyle:code?getComputedStyle(code).textOverflow:''};})}),name));await page.screenshot({path:`${directory}/${name}.png`,animations:'disabled',fullPage:true});screenshots.push(name+'.png');};
 const base=`http://127.0.0.1:5174/?project=${f.ctx.projectId}`;
 for(const theme of ['light','dark'] as const){const profile=unwrap(await settings.personal(f.ctx.userId));unwrap(await settings.savePersonal(f.ctx.userId,{...profile,theme,timezone:'America/Toronto'}));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1100});
  for(const [name,receiptId] of [['served',receipt],['refused',refusedRun.id],['historical',historical]] as const){
   await page.goto(base+`&screen=activity&provenance=${receiptId}`);await page.getByRole('button',{name:/1. Request/}).waitFor();
   await capture(`provenance-${name}-${width}-${theme}`);
   await page.getByRole('button',{name:/1. Request/}).click();await page.getByRole('dialog',{name:'Request',exact:true}).waitFor();await capture(`provenance-${name}-detail-${width}-${theme}`);if(name==='served'){await page.getByRole('button',{name:'Close Request',exact:true}).click();await page.getByRole('button',{name:/5. Custody/}).click();await page.getByRole('dialog',{name:'Custody',exact:true}).waitFor();await capture(`provenance-custody-detail-${width}-${theme}`);}
  }
  for(const [name,screen,extra] of [
   ['custody','pools',`&pool=${f.pool}&tab=custody`],['custody-empty','pools',`&pool=${emptyPool}&tab=custody`],
   ['access','pools',`&pool=${f.pool}&tab=access`],['agents','pools',`&pool=${f.pool}&tab=agents`],['credentials','pools',`&pool=${f.pool}&tab=credentials`],
   ['catalog','data',''],['settings-custody','settings','&section=custody'],['settings-limits','settings','&section=query']
  ]){if(name==='settings-custody')await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{custody}', $2::jsonb) WHERE id=$1",[f.ctx.projectId,JSON.stringify({provider:'xq',tenant:'review-public-label'})]));await page.goto(base+`&screen=${screen}`+extra);await page.locator('[data-main] main').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-list-state=loading]'));await expect.poll(()=>page.locator('[data-list-state=error]').count()).toBe(0);await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);await capture(`${name}-${width}-${theme}`);if(name==='settings-limits'){await page.getByRole('button',{name:'Edit limits',exact:true}).first().click();await page.getByRole('dialog').waitFor();await capture(`settings-limits-editor-${width}-${theme}`);}if(name==='settings-custody'){await page.getByRole('button',{name:'Edit credentials',exact:true}).click();await page.getByRole('dialog',{name:'Edit credentials',exact:true}).waitFor();await capture(`settings-credentials-editor-${width}-${theme}`);}if(name==='catalog'){await page.getByRole('button',{name:'Account menu',exact:true}).click();await page.getByRole('menuitemradio',{name:'System',exact:true}).waitFor();await capture(`theme-menu-${width}-${theme}`);}if(name==='agents'&&await page.locator('[data-agent-name]').count()){await page.locator('[data-agent-name]').first().click();await page.locator('[data-agent-panel]').waitFor();await capture(`agent-panel-${width}-${theme}`);}}
 }
 }
 await writeFile(directory+'/capture.json',JSON.stringify({screenshots,errors,responses,layout,fixture:'Isolated database and real API projections; injected fixture administrator; local custody; XQ settings screenshot uses unconfigured fixture provider metadata, no remote call or credentials; no cloud deployment.'},null,2));
 expect(layout.filter(r=>r.overflow!==0),'Horizontal page overflow').toEqual([]);expect(layout.flatMap(r=>r.identifierTargets).every(t=>t.width>=44&&t.height>=44&&t.whiteSpace==='nowrap'&&t.overflowStyle==='ellipsis')).toBe(true);expect(layout.some(r=>r.viewport===390&&r.identifierTargets.some(t=>t.truncated))).toBe(true);
 expect(errors).toEqual([]);expect(responses.filter(r=>r.status>=400)).toEqual([]);await context.close();
 }finally{await browser.close();await new Promise<void>(resolve=>vite.httpServer.close(()=>resolve()));registry.close();api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));await hub.close();await redis.close();}
},600000);
