import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {loadDevEnvironment} from '../scripts/dev-environment.js';
import {mock as consoleFixture,expand,openDeclarations} from './catalog-fixture.js';

// Unlike the presentation fixtures, this test proxies browser requests to real
// mounted application routes, Postgres repositories and a registered TLS Engine.
test('DECL-001/006: console declarations and tokenized entitlement through real routes and source Engine',async({page})=>{
 test.setTimeout(120_000);
 const environment=loadDevEnvironment(),database=new URL(environment.testDatabaseUrl);
 if(process.platform==='linux'&&['localhost','127.0.0.1'].includes(database.hostname))database.hostname='host.docker.internal';
 process.env.DATABASE_URL=database.toString();
 const [{bulkFixture,allowBulk},{withTenant,withPlatform},{PostgresElementDeclarations,PostgresTemporalRepository},{declarationRoutes},{catalogRoutes},{PostgresCatalogTreeReader},{entitlementReadRoutes},{bulkEntitlementRoutes},{PostgresEntitlementReader,BulkEntitlementService,PostgresBulkEntitlements},{EngineRegistry,PostgresEngineRepository,HttpsEngineProbe,RegistryCustodyClient},{createHttpServer},{once},{mkdtemp,rm},{tmpdir},{join},{prepareSidecarDevelopment},{loadSidecarConfig},{createSidecarServer},{developmentEngineOptions},{ok}]=await Promise.all([
  import('../test/fixtures/bulk-entitlements/fixture.js'),import('../src/platform/db/scope.js'),import('../src/modules/catalog/index.js'),import('../src/modules/catalog/api/declaration-routes.js'),import('../src/modules/catalog/api/tree-routes.js'),import('../src/modules/catalog/infrastructure/tree.js'),import('../src/modules/entitlements/api/read-routes.js'),import('../src/modules/entitlements/api/bulk-routes.js'),import('../src/modules/entitlements/index.js'),import('../src/modules/engines/index.js'),import('../src/platform/http/index.js'),import('node:events'),import('node:fs/promises'),import('node:os'),import('node:path'),import('../scripts/sidecar-dev.js'),import('../sidecar/config.js'),import('../sidecar/http/server.js'),import('../scripts/development-engine.js'),import('../src/shared/kernel/index.js'),
 ]);
 const unwrap=<T,>(r:import('../src/shared/kernel/index.js').Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
 const f=await bulkFixture(1),directory=await mkdtemp(join(tmpdir(),'declarations-live-'));
 const [owner]=await withPlatform(tx=>tx.query<{company_id:string}>('SELECT company_id FROM project WHERE id=$1',[f.ctx.projectId]));
 let engine:ReturnType<typeof createSidecarServer>|undefined,server:ReturnType<typeof createHttpServer>|undefined;
 try{
  await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,f.actor.email+f.ctx.userId]));
  await withTenant(f.ctx,tx=>tx.query('UPDATE catalog_element SET token_domain=NULL,ordinal=1 WHERE id=$1',[f.ids[0]]));
  await prepareSidecarDevelopment(directory);const {config,tls}=await loadSidecarConfig(join(directory,'service.json'));
  const unused=async()=>ok({reachable:true as const});engine=createSidecarServer({config:{...config,port:0},tls,connector:{testConnection:unused,introspect:unused,sampleTopValues:unused,estimateRowCount:unused} as Parameters<typeof createSidecarServer>[0]['connector']});
  const port=await engine.listen(),options={...await developmentEngineOptions(join(directory,'service.json')),baseUrl:`https://127.0.0.1:${port}`};
  const registry=new EngineRegistry(new PostgresEngineRepository(),new HttpsEngineProbe(),options.tls),registered=unwrap(await registry.register(f.ctx,{name:'Declaration Engine',address:options.baseUrl,certificatePin:options.tls.certificatePin}));unwrap(await registry.verify(f.ctx,registered.id));unwrap(await registry.assign(f.ctx,f.source,registered.id));
  const declarations=new PostgresElementDeclarations(new RegistryCustodyClient(registry));
  server=createHttpServer([...declarationRoutes(declarations,new PostgresTemporalRepository()),...catalogRoutes(new PostgresCatalogTreeReader()),...entitlementReadRoutes(new PostgresEntitlementReader()),...bulkEntitlementRoutes(new BulkEntitlementService(new PostgresBulkEntitlements()))],{authorization:{currentUser:async()=>f.actor,port:allowBulk},logger:{error:()=>{}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');const origin=`http://127.0.0.1:${address.port}`;
  await consoleFixture(page);
  await page.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/v1/projects')return route.fulfill({json:{items:[{id:f.ctx.projectId,name:'Bulk project',company:{id:owner!.company_id,name:'Bulk tests'},industry:{id:f.source,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
   if(url.pathname.endsWith('/sources'))return route.fulfill({json:{items:[{id:f.source,name:'Warehouse',exposedAlias:'warehouse',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:null,filingCount:null,elementCount:1,unsupportedCount:0,undecidedCount:1,latestIntrospectionId:null,lastIntrospectedAt:null}],nextCursor:null}});
   if(url.pathname.includes('/catalog')||url.pathname.endsWith('/pools')||url.pathname.includes('/entitlement')){const response=await route.fetch({url:origin+url.pathname+url.search});return route.fulfill({response});}
   return route.fallback();
  });
  await page.goto(`/projects/${f.ctx.projectId}/data-sources`);await page.getByRole('link',{name:'Explore schema',exact:true}).click();await expand(page);
  await page.getByRole('button',{name:'Declarations for field_1',exact:true}).click();await openDeclarations(page);await expect(page.getByLabel('Canonicaliser',{exact:true})).toBeEnabled();
  await page.getByLabel('Token domain',{exact:true}).fill('customer');await page.getByRole('button',{name:'Declare token domain',exact:true}).click();await expect(page.getByText('Declarations saved.',{exact:true})).toBeVisible();
  expect(unwrap(await declarations.read(f.ctx,f.ids[0]!))).toMatchObject({stored:{tokenDomain:'customer'},discoveryError:null});
  await page.getByRole('button',{name:'Entitlements',exact:true}).click();await page.getByRole('button',{name:'By table',exact:true}).click();await page.getByRole('button',{name:'Everything',exact:true}).click();await expand(page);await page.getByLabel('Select field_1',{exact:true}).check();await page.getByLabel('Treatment',{exact:true}).selectOption('tokenized');await page.getByRole('button',{name:'Apply to selection',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'entitlement decisions saved.'})).toContainText('1 entitlement decisions saved.');
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT treatment FROM entitlement WHERE element_id=$1',[f.ids[0]]))).toEqual([{treatment:'tokenized'}]);
 }finally{
  if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));await engine?.close();await rm(directory,{recursive:true,force:true});
  // Test-database governance history is append-only. The repository's normal
  // fixture reset removes it; do not attempt ad-hoc DELETE cleanup.
 }
});
