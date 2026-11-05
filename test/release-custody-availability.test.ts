import {afterEach,expect,it} from 'vitest';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {queryFixture} from './fixtures/query/fixture.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {releaseClaims} from '../src/shared/release-contract.js';
import {PostgresGrantSignatures} from '../src/modules/release-custody/index.js';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
it('REL-013: unavailable custody refuses referenced columns before execution, including WHERE, while unrelated projections remain usable',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
 expect(await f.release!.status(f.ctx)).toMatchObject({provider:'local',available:true,affectedColumns:1});
 await withTenant(f.ctx,tx=>tx.query('SELECT record_custody_check($1)',[{binding:'not-the-current-config',passed:true,at:new Date().toISOString(),failure:null}]));
 const before=f.boundary.executions;
 for(const statement of ['SELECT field_1 FROM warehouse.public.records','SELECT field_4 FROM warehouse.public.records WHERE field_1=1','WITH q AS (SELECT field_1 AS a FROM warehouse.public.records) SELECT a FROM q'])expect(await f.query(statement)).toMatchObject({isError:true,_meta:{cause:'release_configuration',reason:'provider_configuration_changed'},content:[{type:'text',text:'The custody provider configuration changed after its connection check. No result was released. Configure a custody provider in Settings.'}]});
 expect(f.boundary.executions).toBe(before);
 expect(await f.query('SELECT field_4 FROM warehouse.public.records')).not.toHaveProperty('isError',true);
 await f.release!.checkConnection(f.ctx);expect((await f.release!.status(f.ctx)).available).toBe(true);
 await withPlatform(tx=>tx.query("UPDATE project SET settings=settings-'custody' WHERE id=$1",[f.ctx.projectId]));
 expect(await f.query('SELECT field_1 FROM warehouse.public.records')).toMatchObject({isError:true,_meta:{reason:'provider_not_configured'}});
 expect(await f.release!.status(f.ctx)).toMatchObject({provider:null,available:false,affectedColumns:1});
},60000);
it('REL-014: signing versions are deterministic across instances, rotate atomically and persist no private key',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 const first=new PostgresGrantSignatures({id:'local',tenant:'local'},'11'.repeat(32)),second=new PostgresGrantSignatures({id:'local',tenant:'local'},'11'.repeat(32));
 expect((await first.describe(f.ctx)).keys).toEqual((await second.describe(f.ctx)).keys);
 await Promise.all([first.rotate(f.ctx,600),second.rotate(f.ctx,600)]);
 const keys=(await first.describe(f.ctx)).keys;expect(keys.map(k=>k.kid).sort()).toEqual(['1','2','3']);expect(new Set(keys.map(k=>k.x)).size).toBe(3);
 const [stored]=await withTenant(f.ctx,tx=>tx.query<{secrets:boolean}>("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='release_signing_key' AND column_name='private_key') AS secrets"));expect(stored?.secrets).toBe(false);
 await withTenant(f.ctx,tx=>tx.query("UPDATE release_signing_key SET verify_until=clock_timestamp()-interval '1 second' WHERE retired_at IS NOT NULL"));expect((await first.describe(f.ctx)).keys.map(k=>k.kid)).toEqual(['3']);
},60000);

it('REL-016: provider changes confirm live grants and revoke their original escrows with immutable reasons',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
 const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent),grant=answer.custody![0]!.grant,claims=releaseClaims.parse(JSON.parse(Buffer.from(grant.split('.')[1]!,'base64url').toString('utf8')));
 expect(await f.release!.saveProjectSettings(f.ctx,{query:{rowLimit:101}})).toMatchObject({ok:true});
 const [live]=await withTenant(f.ctx,tx=>tx.query('SELECT state FROM release_grant WHERE id=$1',[claims.jti]));expect(live).toEqual({state:'granted'});
 const settings={custody:{provider:'xq' as const,tenant:'new-tenant',region:'CA',grant_ttl:600}};
 expect(await f.release!.saveProjectSettings(f.ctx,settings)).toMatchObject({ok:false,error:{details:{cause:'custody_provider_change',liveGrantCount:1}}});
 expect(await f.release!.saveProjectSettings(f.ctx,settings,0)).toMatchObject({ok:false});
 expect(await f.release!.saveProjectSettings(f.ctx,settings,1)).toMatchObject({ok:true});
 const [stored]=await withTenant(f.ctx,tx=>tx.query('SELECT share,state,escrow_revoked FROM release_grant WHERE id=$1',[claims.jti]));expect(stored).toEqual({share:null,state:'revoked',escrow_revoked:true});
 const [event]=await withTenant(f.ctx,tx=>tx.query('SELECT reason,actor FROM release_event WHERE grant_id=$1 AND kind=\'revoked\'',[claims.jti]));expect(event).toEqual({reason:'provider changed',actor:f.ctx.userId});
 expect(await f.client.callTool({name:'opintel.redeem',arguments:{grant}})).toMatchObject({isError:true,_meta:{cause:'release_refused'}});
},60000);
it('DEP-009: an operator settings snapshot cannot overwrite an intervening administrator decision',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 const [before]=await withPlatform(tx=>tx.query<{settings:Record<string,unknown>}>('SELECT settings FROM project WHERE id=$1',[f.ctx.projectId]));
 expect(await f.release!.saveProjectSettings(f.ctx,{query:{rowLimit:101}})).toMatchObject({ok:true});
 expect(await f.release!.saveProjectSettings(f.ctx,{query:{rowLimit:102}},undefined,before!.settings)).toMatchObject({ok:false,error:{code:'conflict'}});
 const [after]=await withPlatform(tx=>tx.query<{limit:number}>("SELECT (settings->'query'->>'rowLimit')::int AS limit FROM project WHERE id=$1",[f.ctx.projectId]));expect(after?.limit).toBe(101);
});

it('CONSOLE-03 XQ credentials are checked before encrypted storage, override env, and expose only status',async()=>{
 const {vi}=await import('vitest'),{XqReleaseProvider}=await import('../src/modules/release-custody/infrastructure/xq-provider.js'),{custodyAvailability}=await import('../src/modules/release-custody/infrastructure/availability.js');
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 vi.stubEnv('OPINTEL_CUSTODY_MASTER_KEY','11'.repeat(32));vi.stubEnv('OPINTEL_XQ_REDEEM_URL','https://example.invalid/redeem');vi.stubEnv('OPINTEL_XQ_API_KEY','old-api');
 const health=vi.spyOn(XqReleaseProvider.prototype,'health').mockResolvedValue({reachable:true,authenticated:true,failure:null});
 try{
 await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{custody,provider}','\"xq\"') WHERE id=$1",[f.ctx.projectId]));
 const credentials={apiKey:'new-api-secret',dashboardApiKey:'dashboard-secret',senderAlias:'sender-secret',senderAccessToken:'access-secret',tenant:'team-secret'};
 expect((await custodyAvailability(f.ctx.projectId)).environment.apiKey).toBe('old-api');
 expect(await f.release!.saveCredentials(f.ctx,credentials)).toEqual({ok:true,value:undefined});expect(health).toHaveBeenCalledOnce();
 const state=await custodyAvailability(f.ctx.projectId);expect(state.available).toBe(true);expect(state.environment.apiKey).toBe(credentials.apiKey);expect(state.configuration?.tenant).toBe(credentials.tenant);
 const status=await f.release!.status(f.ctx);expect(status.credentials).toMatchObject({apiKey:true,dashboardApiKey:true,senderAlias:true,senderAccessToken:true,tenant:true});expect(status.credentials?.changedAt).toBeTruthy();
 const [stored]=await withPlatform(tx=>tx.query<{ciphertext:string}>('SELECT custody_credentials AS ciphertext FROM project WHERE id=$1',[f.ctx.projectId]));
 const audit=await withTenant(f.ctx,tx=>tx.query("SELECT before,after FROM audit_entry WHERE action='CustodyCredentialsChanged'"));expect(audit).toEqual([{before:null,after:{credentialsSet:true}}]);
 for(const secret of Object.values(credentials)){expect(JSON.stringify(status)).not.toContain(secret);expect(stored!.ciphertext).not.toContain(secret);expect(JSON.stringify(audit)).not.toContain(secret);}
 health.mockResolvedValue({reachable:true,authenticated:false,failure:'authentication_refused'});expect(await f.release!.saveCredentials(f.ctx,{...credentials,apiKey:'invalid-secret'})).toMatchObject({ok:false,error:{code:'validation_failed'}});expect((await custodyAvailability(f.ctx.projectId)).environment.apiKey).toBe(credentials.apiKey);
 const {decryptCredentials}=await import('../src/modules/release-custody/infrastructure/provider-credentials.js');expect(()=>decryptCredentials('different-project',stored!.ciphertext)).toThrow('could not be opened');
 }finally{health.mockRestore();vi.unstubAllEnvs();}
});
it('CONSOLE-03 credential rotation requires exact live-grant confirmation before revoking or saving',async()=>{
 const {vi}=await import('vitest'),{XqReleaseProvider}=await import('../src/modules/release-custody/infrastructure/xq-provider.js');
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
 const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);
 vi.stubEnv('OPINTEL_CUSTODY_MASTER_KEY','11'.repeat(32));vi.stubEnv('OPINTEL_XQ_REDEEM_URL','https://example.invalid/redeem');const health=vi.spyOn(XqReleaseProvider.prototype,'health').mockResolvedValue({reachable:true,authenticated:true,failure:null});
 try{
 await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{custody,provider}','\"xq\"') WHERE id=$1",[f.ctx.projectId]));
 const input={apiKey:'fixture-api',dashboardApiKey:'fixture-dashboard',senderAlias:'fixture-sender',senderAccessToken:'fixture-access',tenant:'fixture-team'};
 expect(await f.release!.saveCredentials(f.ctx,input)).toMatchObject({ok:false,error:{details:{liveGrantCount:answer.custody!.length}}});
 expect(await f.release!.saveCredentials(f.ctx,{...input,confirmedLiveGrants:0})).toMatchObject({ok:false});
 expect(await f.release!.saveCredentials(f.ctx,{...input,confirmedLiveGrants:answer.custody!.length})).toMatchObject({ok:true});
 const rows=await withTenant(f.ctx,tx=>tx.query('SELECT state,share FROM release_grant'));expect(rows.every(r=>r.state==='revoked'&&r.share===null)).toBe(true);
 }finally{health.mockRestore();vi.unstubAllEnvs();}
});

it('CONSOLE-03 credential route requires project administration and never calls the provider for a viewer',async()=>{
 const {once}=await import('node:events'),{createHttpServer}=await import('../src/platform/http/index.js'),{releaseRoutes}=await import('../src/modules/release-custody/api/routes.js'),{allowBulk}=await import('./fixtures/bulk-entitlements/fixture.js');
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);let admin=false;
 const server=createHttpServer(releaseRoutes(f.release!),{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async r=>({...await allowBulk.check(r),allowed:r.permission==='view'||admin})}}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 try{const path=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/custody-provider/credentials`,request={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:'test',dashboardApiKey:'test',senderAlias:'test',senderAccessToken:'test',tenant:'test'})};
  expect((await fetch(path,request)).status).toBe(403);admin=true;
  const malformed=await fetch(path,{...request,body:'{}'});expect(malformed.status).toBe(400);
  const [stored]=await withPlatform(tx=>tx.query('SELECT custody_credentials FROM project WHERE id=$1',[f.ctx.projectId]));expect(stored).toEqual({custody_credentials:null});
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
