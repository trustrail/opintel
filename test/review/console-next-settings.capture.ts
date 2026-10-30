// Manual review capture only. Never part of the normal gate or historical pixels.
import {it,expect,onTestFinished} from 'vitest';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer as createViteServer} from 'vite';
import {chromium} from '@playwright/test';
import {createHttpServer} from '../../src/platform/http/index.js';
import {queryFixture,unwrap} from '../fixtures/query/fixture.js';
import {PostgresNeedsYouReader} from '../../src/modules/tenancy/index.js';
import {TenancyListService} from '../../src/modules/tenancy/application/list-tenancy.js';
import {PostgresTenancyListRepository} from '../../src/modules/tenancy/infrastructure/tenancy-list-repository.js';
import {tenancyListRoutes} from '../../src/modules/tenancy/api/list-routes.js';
import {needsYouRoutes} from '../../src/modules/tenancy/api/needs-you-routes.js';

import {PostgresSettings,PostgresProjectHealthReader} from '../../src/modules/tenancy/index.js';
import {settingsRoutes} from '../../src/modules/tenancy/api/settings-routes.js';
import {projectHealthRoutes} from '../../src/modules/tenancy/api/project-health-routes.js';
import {memberRoutes} from '../../src/modules/tenancy/api/member-routes.js';
import {ListMembersService} from '../../src/modules/tenancy/application/list-members.js';
import {PostgresMemberListRepository} from '../../src/modules/tenancy/infrastructure/member-list-repository.js';
import {invitationRoutes} from '../../src/modules/tenancy/api/invitation-routes.js';
import {InvitationService} from '../../src/modules/tenancy/application/invitations.js';
import {PostgresInvitationRepository} from '../../src/modules/tenancy/infrastructure/invitation-repository.js';
import {RelationshipOutbox} from '../../src/modules/tenancy/application/relationship-outbox.js';
import {releaseRoutes} from '../../src/modules/release-custody/index.js';
import {EngineRegistry,PostgresEngineRepository,HttpsEngineProbe,RegistryCustodyClient,engineRoutes} from '../../src/modules/engines/index.js';
import {KeyCustodyService,PostgresCustodyRepository} from '../../src/modules/entitlements/index.js';
import {keyCustodyRoutes} from '../../src/modules/entitlements/api/key-custody-routes.js';
import {CompanyId,SystemClock} from '../../src/shared/kernel/index.js';
import {withPlatform} from '../../src/platform/db/scope.js';

it('captures Settings using real project settings, membership, custody and engine routes',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});onTestFinished(()=>f.close());
 if(!f.release)throw new Error('Fixture custody runtime is required');
 await withPlatform(tx=>tx.query("UPDATE project SET name='Reinsurance demo',settings=jsonb_set(settings,'{evidence}', $2::jsonb) WHERE id=$1",[f.ctx.projectId,JSON.stringify({fullRetentionDays:30,rollupRetentionDays:365,redaction:'aggressive'})]));
 await withPlatform(tx=>tx.query("UPDATE user_account SET full_name='Review administrator' WHERE id=$1",[f.ctx.userId]));
 const options=f.engineTls;
 const registry=new EngineRegistry(new PostgresEngineRepository(),new HttpsEngineProbe(),options),custody=new KeyCustodyService(new PostgresCustodyRepository(),new RegistryCustodyClient(registry),f.authorization);
 const invitations=new InvitationService(new PostgresInvitationRepository(new RelationshipOutbox()),f.authorization,new SystemClock(),{dispatch:async()=>{/* Delivery stays in the isolated test mail outbox; no SMTP worker. */}});
 const [company]=await withPlatform(tx=>tx.query<{id:string}>('SELECT company_id AS id FROM project WHERE id=$1',[f.ctx.projectId]));
 unwrap(await invitations.create({email:'review.viewer@example.test',role:'viewer',companyId:CompanyId(company!.id),projectId:f.ctx.projectId},f.ctx.projectId,f.ctx.userId));
 const routes=[...settingsRoutes(new PostgresSettings(f.release)),...projectHealthRoutes(new PostgresProjectHealthReader()),...releaseRoutes(f.release),...engineRoutes(registry),...keyCustodyRoutes(custody),...memberRoutes(new ListMembersService(new PostgresMemberListRepository())),...invitationRoutes(invitations),...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(),f.authorization)),...needsYouRoutes(new PostgresNeedsYouReader(),f.authorization)];
 const api=createHttpServer(routes,{authorization:{currentUser:async()=>f.actor,port:f.authorization}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error('Missing API listener');
 const vite=await createViteServer({configFile:'src/console-next/vite.config.ts',server:{port:5174,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${address.port}`,changeOrigin:true}}}});await vite.listen();
 const browser=await chromium.connect('ws://127.0.0.1:9324/',{exposeNetwork:'<loopback>'}),directory='docs/review/console-backend/settings-screenshots';await mkdir(directory,{recursive:true});const errors:string[]=[],responses:Array<{path:string;status:number}>=[],screenshots:string[]=[];
 try{
 const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/'))responses.push({path:new URL(r.url()).pathname,status:r.status()});});
 for(const capture of [{width:1440,name:'custody',section:'custody'},{width:1440,name:'people',section:'people'},{width:1440,name:'query-limits',section:'query'},{width:390,name:'sections',section:null},{width:390,name:'custody',section:'custody'}]){
 await page.setViewportSize({width:capture.width,height:1180});await page.goto(`http://127.0.0.1:5174/?project=${f.ctx.projectId}&screen=settings&theme=light${capture.section?'&section='+capture.section:''}`);await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('[data-list-state=loading]').length===0);await page.getByText('Reinsurance demo · this installation').waitFor();
 if(capture.name==='query-limits'){
 await page.getByRole('button',{name:'Edit limits'}).click();await page.getByLabel('Returned row limit').fill('101');await page.getByRole('button',{name:'Save settings'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('101',{exact:true}).waitFor();
 const saved=await fetch(`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/settings`).then(r=>r.json());expect(saved.settings.query.rowLimit).toBe(101);expect(saved.settings.query.timeoutSeconds).toBe(15);
 }
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
 await page.screenshot({animations:'disabled',path:`${directory}/${capture.width}-light-${capture.name}.png`,fullPage:capture.width===1440});screenshots.push(`${capture.width}-light-${capture.name}.png`);
 }
 expect(errors).toEqual([]);expect(responses.filter(r=>r.status>=400)).toEqual([]);await writeFile(`${directory}/capture.json`,JSON.stringify({screenshots,errors,responses,fixture:'Isolated test database; real HTTP routes; local development custody; no browser response mocks.'},null,2));await context.close();
 }finally{await browser.close();await vite.close();api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));registry.close();}
});
