import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {once} from 'node:events';
import {queryFixture,unwrap} from '../test/fixtures/query/fixture.js';
import {PostgresEvidenceReader,PostgresEvidenceWriter} from '../src/modules/evidence/index.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {rowDecisionRoutes} from '../src/modules/entitlements/api/row-routes.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {ObjectId,RunId} from '../src/shared/kernel/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {poolDetail as poolTemplate,summary as emptySummary} from './console-fixture.js';
import {PostgresPoolTables} from '../src/modules/pools/index.js';
import {poolTableRoutes} from '../src/modules/pools/api/table-routes.js';

// One continuous path. Identity delivery/session is a fixture boundary; decisions,
// permission checks, database, MCP authentication, Engine and evidence are real.
// Provision infrastructure before the user-path deadline. Both hooks retain
// Playwright's unchanged 30-second bound; the continuous browser/MCP path still
// has the same 30-second deadline and all of its original assertions.
let prepared:Awaited<ReturnType<typeof queryFixture>>|undefined;
test.beforeAll(async()=>{prepared=await queryFixture(new PostgresEvidenceWriter());});
test.afterAll(async()=>{await prepared?.close();});
test('sign in → pool → row filter → authenticated MCP query → persisted receipt decision',async({page})=>{
 const f=prepared;if(!f)throw new Error('Smoke backend infrastructure was not prepared.');
 const repo=new PostgresRowDecisions(),tables=new PostgresPoolTables(undefined,f.authorization);let signedIn=false;
 const server=createHttpServer([...rowDecisionRoutes(repo),...poolTableRoutes(tables)],{authorization:{currentUser:async()=>signedIn?f.actor:null,port:f.authorization}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();
 if(!address||typeof address==='string')throw new Error('Missing smoke API listener');
 const backend=`http://127.0.0.1:${address.port}`;
 try{
  const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));
  const objectId=ObjectId(object!.id),poolPath=`/projects/${f.ctx.projectId}/pools/${f.pool}`;
  unwrap(await tables.add(f.ctx,f.pool,[objectId],{allRows:true}));
  await page.addInitScript(()=>{class Stream{close(){}}Object.defineProperty(window,'EventSource',{value:Stream});});
  await page.route('**/api/v1/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname;
   if(path.endsWith('/auth/providers'))return route.fulfill({json:{magicLink:true,providers:[],enforced:null}});
   if(path.endsWith('/auth/request-link'))return route.fulfill({status:204});
   if(path.endsWith('/auth/callback')){signedIn=true;return route.fulfill({json:{deviceMismatch:false}});}
   if(path.endsWith('/auth/me'))return signedIn?route.fulfill({json:f.actor}):route.fulfill({status:401,json:{error:{code:'unauthenticated',message:'Sign in is required.',requestId:'smoke',retryable:false}}});
   if(path.includes('/row-entitlements')||path.includes('/row-decisions/')||path.includes('/tables')){
    const response=await fetch(backend+path+url.search,{method:request.method(),headers:{'content-type':'application/json'},...(request.postData()?{body:request.postData()!}:{})});
    return route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});
   }
   if(path.endsWith('/projects')&&!signedIn)return route.fulfill({status:401,json:{error:{code:'unauthenticated',message:'Sign in is required.',requestId:'smoke',retryable:false}}});
   if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:f.ctx.projectId,name:'Smoke project',company:{id:f.ctx.userId,name:'Smoke company'},industry:{id:f.ctx.userId,name:'General'},region:'eu-west-1',role:'admin'}],nextCursor:null}});
   if(path.endsWith('/needs-you')||path.endsWith('/entitlement-members')||path.endsWith('/runs'))return route.fulfill({json:{items:[],nextCursor:null}});
   if(path.endsWith('/runs/summary'))return route.fulfill({json:emptySummary});
   if(path.endsWith('/pools'))return route.fulfill({json:{items:[{...poolTemplate,id:f.pool,name:'Query pool',sourceIds:[f.source]}],nextCursor:null}});
   if(path.endsWith('/agents'))return route.fulfill({json:{items:[],nextCursor:null}});
   if(path.endsWith('/pools/'+f.pool))return route.fulfill({json:{...poolTemplate,id:f.pool,name:'Query pool',sourceIds:[f.source],keys:[],agents:0,activeAgents:0}});
   if(path.includes('/runs/')){
    const receipt=unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(path.split('/').at(-1)!),url.searchParams.get('startedAt')!));
    return route.fulfill({json:receipt});
   }
   return route.fulfill({status:404,json:{error:{code:'not_found',message:'No smoke fixture for this route.',requestId:'smoke',retryable:false}}});
  });
  await page.goto(poolPath);await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel('Work email').fill('bulk@example.com');await page.getByRole('button',{name:'Continue with email',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check your email'})).toBeVisible();
  await page.goto('/auth/callback?token=fixture-mail-link');await expect(page).toHaveURL(url=>url.pathname==='/'&&url.searchParams.get('pool')===f.pool);await page.goto(poolPath);
  await page.getByRole('button',{name:'Set rows',exact:true}).click();
  const editor=page.locator('[data-inline-rows]');await editor.getByLabel('Row rule column').fill('field_1');
  await editor.getByRole('combobox',{name:'Row rule operator'}).click();await page.getByRole('option',{name:'>=',exact:true}).click();
  await editor.getByRole('combobox',{name:'Value type'}).click();await page.getByRole('option',{name:'Number',exact:true}).click();
  await editor.getByLabel('Row rule value').fill('3');await editor.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(editor).toHaveCount(0);
  const decision=unwrap(await repo.read(f.ctx,f.pool,objectId)).current!;
  expect(decision.expression).toMatch(/field_1.*>=.*3/u);
  const response=await f.query('SELECT field_1 FROM warehouse.public.records ORDER BY field_1');expect(response.isError).not.toBe(true);
  const answer=QueryOutput.parse(response.structuredContent);expect(answer.rows).toEqual([[3],[4],[5],[6],[7]]);
  expect(answer.rowScopes?.[0]?.decisionIds).toEqual([decision.id]);
  const [run]=await withTenant(f.ctx,tx=>tx.query<{at:string}>('SELECT started_at::text AS at FROM query_run WHERE id=$1',[answer.evidenceId]));
  const stored=unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(answer.evidenceId),run!.at));
  expect(stored.metadata.rowScopes?.[0]?.decisionIds).toEqual([decision.id]);
  await page.goto(`/projects/${f.ctx.projectId}/runs/${answer.evidenceId}?startedAt=${encodeURIComponent(stored.startedAt)}`);
  const receipt=page.getByRole('dialog');
  await expect(receipt.getByRole('link',{name:'Open recorded row decision'})).toHaveAttribute('href',new RegExp('rowDecisionId='+decision.id));
  await expect(receipt).toContainText('5 rows');await expect(receipt).toContainText(stored.agentId!);await expect(receipt).toContainText(stored.keyPrefix);
  await receipt.getByRole('link',{name:'Open recorded row decision'}).click();await expect(page.getByRole('region',{name:'Historical row decision'})).toContainText(decision.expression);

 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
