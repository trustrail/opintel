import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {PostgresSettings} from '../src/modules/tenancy/index.js';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {CompanyId} from '../src/shared/kernel/index.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
const service=new PostgresSettings();
it('Q-036 project settings and their before/after audit commit together',async()=>{
 const f=await policyFixture(0);const before=unwrap(await service.project(f.ctx.projectId));
 const saved=unwrap(await service.saveProject(f.ctx.projectId,f.ctx.userId,{query:{rowLimit:123},discovery:{valueSampling:false}}));expect(saved.settings.query).toMatchObject({rowLimit:123});
 const [entry]=await withTenant(f.ctx,tx=>tx.query<{before:unknown;after:unknown;actor_id:string}>("SELECT before,after,actor_id FROM audit_entry WHERE action='ProjectSettingsChanged'"));expect(entry).toEqual({before:before.settings,after:saved.settings,actor_id:f.ctx.userId});
});
it('Q-001, Q-003, Q-036 profile persists and is audited; email is not a write field',async()=>{
 const f=await policyFixture(0);await withPlatform(tx=>tx.query("INSERT INTO user_account(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",[f.ctx.userId,randomUUID()+'@example.com']));const initial=unwrap(await service.personal(f.ctx.userId));const result=unwrap(await service.savePersonal(f.ctx.userId,{fullName:'Reader',timezone:'America/Toronto',dateFormat:'DD/MM/YYYY',reducedMotion:true}));expect(result).toEqual({...initial,fullName:'Reader',timezone:'America/Toronto',dateFormat:'DD/MM/YYYY',reducedMotion:true});
 const audit=await withPlatform(tx=>tx.query("SELECT id FROM audit_entry WHERE actor_id=$1 AND action='PersonalSettingsChanged'",[f.ctx.userId]));expect(audit).toHaveLength(1);
});
it('enforced SSO refuses zero and multiple enabled providers and guards provider changes',async()=>{
 const f=await policyFixture(0);const [p]=await withPlatform(tx=>tx.query<{company_id:string}>('SELECT company_id FROM project WHERE id=$1',[f.ctx.projectId]));const id=CompanyId(p!.company_id);const current=unwrap(await service.company(id));const {enabledProviders:_,id:__,...body}=current;
 const refused=await service.saveCompany(id,f.ctx.userId,{...body,ssoEnforced:true});expect(refused.ok).toBe(false);if(!refused.ok)expect(refused.error.message).toContain('exactly one');
 const provider=randomUUID();await withPlatform(tx=>tx.query("INSERT INTO company_idp(id,company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,$2,'oidc:generic','Company SSO','https://example.com','client','secret://test')",[provider,id]));
 expect((await service.saveCompany(id,f.ctx.userId,{...body,ssoEnforced:true})).ok).toBe(false);
 // This count-invariant fixture represents an administrator's completed sign-in.
 // The HTTP round-trip and absence/invalidity of proof are covered in the 5.18 suite.
 await withPlatform(async tx=>{
  await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING',[f.ctx.userId,randomUUID()+'@example.com']);
  await tx.query('INSERT INTO company_idp_sign_in(idp_id,configuration_version,user_id,session_id,completed_at) SELECT id,configuration_version,$2,$3,now() FROM company_idp WHERE id=$1',[provider,f.ctx.userId,randomUUID()]);
 });
 expect((await service.saveCompany(id,f.ctx.userId,{...body,ssoEnforced:true})).ok).toBe(true);
 await expect(withPlatform(tx=>tx.query('UPDATE company_idp SET enabled=false WHERE id=$1',[provider]))).rejects.toMatchObject({constraint:'company_sso_configuration_locked'});
 await expect(withPlatform(tx=>tx.query('DELETE FROM company_idp WHERE id=$1',[provider]))).rejects.toMatchObject({constraint:'company_sso_one_enabled_idp'});
 await expect(withPlatform(tx=>tx.query("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:google','Second','https://example.com','client','secret://test')",[id]))).rejects.toMatchObject({constraint:'company_sso_one_enabled_idp'});
});
it('Q-006/Q-035: route writes require administration; reads require view; invalid bounds never persist',async()=>{
 const {once}=await import('node:events');const {createHttpServer}=await import('../src/platform/http/index.js');const {settingsRoutes}=await import('../src/modules/tenancy/api/settings-routes.js');const {allowBulk}=await import('./fixtures/bulk-entitlements/fixture.js');const f=await policyFixture(0);let admin=false;
 const server=createHttpServer(settingsRoutes(service),{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async r=>({...await allowBulk.check(r),allowed:r.permission==='view'||admin})}}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error();const path=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/settings`;
 try{expect((await fetch(path)).status).toBe(200);expect((await fetch(path,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({query:{rowLimit:100}})})).status).toBe(403);admin=true;expect((await fetch(path,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({query:{aggregateMinGroupSize:1001}})})).status).toBe(400);
 expect((await fetch(path,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({query:{aggregateMinGroupSize:1}})})).status).toBe(200);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
it('Q-011–Q-014: safe discovery defaults permit introspection; carry and revert take effect',async()=>{
 const f=await policyFixture(1);await f.set();expect((await f.introspect('text')).state).toBe('complete');
 await service.saveProject(f.ctx.projectId,f.ctx.userId,{discovery:{newElements:'hold',typeFamilyChange:'carry',renameHandling:'carry',adoptRenamedNames:false,valueSampling:false}});
 expect((await f.introspect('integer')).state).toBe('complete');expect(await withTenant(f.ctx,tx=>tx.query('SELECT treatment FROM entitlement'))).toHaveLength(1);
 await service.saveProject(f.ctx.projectId,f.ctx.userId,{discovery:{newElements:'hold',typeFamilyChange:'revert',renameHandling:'carry',adoptRenamedNames:false,valueSampling:false}});
 expect((await f.introspect('text')).state).toBe('complete');expect(await withTenant(f.ctx,tx=>tx.query('SELECT treatment FROM entitlement'))).toHaveLength(0);
});
it('Q-011/Q-012: hold suppresses rule application; rules_only applies eligible matches',async()=>{
 const f=await policyFixture(1);await withTenant(f.ctx,tx=>tx.query("INSERT INTO pattern_rule(project_id,matcher,match_kind,treatment,priority) VALUES($1,'added*','name_glob','clear',100)",[f.ctx.projectId]));
 const choices={typeFamilyChange:'revert',renameHandling:'carry',adoptRenamedNames:false,valueSampling:false};
 await service.saveProject(f.ctx.projectId,f.ctx.userId,{discovery:{...choices,newElements:'hold'}});expect((await f.introspect('text',['added_one'])).state).toBe('complete');expect(await withTenant(f.ctx,tx=>tx.query('SELECT treatment FROM entitlement'))).toHaveLength(0);
 await service.saveProject(f.ctx.projectId,f.ctx.userId,{discovery:{...choices,newElements:'rules_only'}});expect((await f.introspect('text',['added_one','added_two'])).state).toBe('complete');expect(await withTenant(f.ctx,tx=>tx.query('SELECT treatment FROM entitlement'))).toEqual([{treatment:'clear'}]);
});
