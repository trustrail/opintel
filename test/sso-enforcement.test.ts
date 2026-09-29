import {randomUUID} from 'node:crypto';
import {it,expect,vi} from 'vitest';
import {withPlatform} from '../src/platform/db/scope.js';
import {CompanyId,SessionId,SystemClock} from '../src/shared/kernel/index.js';
import {OidcService,type OidcFlowState,type OidcProviderPort} from '../src/modules/identity/application/oidc.js';
import type {SessionPort} from '../src/modules/identity/application/session.js';
import {PostgresOidcConfigurationRepository} from '../src/modules/identity/infrastructure/oidc-configuration-repository.js';
import {PostgresIdentityRepository} from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import {PostgresSettings} from '../src/modules/tenancy/index.js';

async function fixture(){
 const [row]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('SSO proof test','eu-west-1') RETURNING id"));const companyId=CompanyId(row!.id);
 const [idp]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:generic','SSO','https://idp.example','client','secret://test') RETURNING id",[companyId]));
 const clock=new SystemClock(),accounts=new PostgresIdentityRepository(clock),user=await accounts.create(randomUUID()+'@example.com',null);
 const other=await accounts.create(randomUUID()+'@example.com',null);
 const configurations=new PostgresOidcConfigurationRepository(),flows=new Map<string,OidcFlowState>();
 const provider={authorizationUrl:vi.fn<OidcProviderPort['authorizationUrl']>(async()=> 'https://idp.example/authorize'),exchange:vi.fn<OidcProviderPort['exchange']>(async()=>({subject:randomUUID(),email:user.email,emailVerified:true}))};
 const sessions:SessionPort={create:vi.fn(async()=>SessionId(randomUUID())),read:async()=>null,touch:async()=>{},rotate:async id=>id,revoke:vi.fn(async()=>{}),revokeAllFor:async()=>0,listFor:async()=>[]};
 const service=new OidcService(configurations,{save:async(state,flow)=>{flows.set(state,flow);},consume:async state=>{const f=flows.get(state)??null;flows.delete(state);return f;}},provider,accounts,accounts,sessions,clock);
 const settings=new PostgresSettings(),view=await settings.company(companyId);if(!view.ok)throw view.error;const {id:_,enabledProviders:__,...body}=view.value;
 const begin=()=>service.begin({companyId,provider:'oidc:generic',inviteId:null,redirectUri:'https://console.example/auth/oidc/oidc:generic/callback',deviceNonce:'browser'});
 const callback=(state:string)=>service.callback(state,`https://console.example/auth/oidc/oidc:generic/callback?state=${state}&code=ok`,{ip:'unknown',userAgent:'test'},'oidc:generic');
 const signIn=async()=>callback((await begin()).state);
 const enable=(actor=user.id)=>settings.saveCompany(companyId,actor,{...body,ssoEnforced:true});
 const disable=()=>settings.saveCompany(companyId,user.id,{...body,ssoEnforced:false});
 const proof=()=>withPlatform(tx=>tx.query('SELECT * FROM company_idp_sign_in WHERE idp_id=$1',[idp!.id]));
 return {companyId,idp:idp!.id,user,other,configurations,provider,sessions,settings,begin,callback,signIn,enable,disable,proof};
}
it('5.18 refuses enforcement before a completed sign-in, including after successful discovery/start; records the refusal',async()=>{
 const f=await fixture();expect((await f.enable()).ok).toBe(false);await f.begin();expect((await f.enable()).ok).toBe(false);expect(await f.proof()).toEqual([]);
 const view=await f.settings.company(f.companyId);expect(view.ok&&view.value.ssoEnforced).toBe(false);
 expect(await withPlatform(tx=>tx.query("SELECT id FROM audit_entry WHERE company_id=$1 AND action='SsoEnforcementRefused'",[f.companyId]))).toHaveLength(2);
});
it('5.18 only the signing-in administrator can enable the exact company configuration',async()=>{
 const f=await fixture();expect(await f.signIn()).toMatchObject({kind:'session'});expect(await f.proof()).toHaveLength(1);
 expect((await f.enable(f.other.id)).ok).toBe(false);expect((await f.enable()).ok).toBe(true);
 const another=await fixture();expect((await another.enable(f.user.id)).ok).toBe(false);
});
it('5.18 failed exchange, unverified email and failed session creation never establish proof',async()=>{
 const f=await fixture();f.provider.exchange.mockRejectedValueOnce(new Error('provider failed'));expect(await f.signIn()).toMatchObject({kind:'refused'});
 f.provider.exchange.mockResolvedValueOnce({subject:'unverified',email:f.user.email,emailVerified:false});expect(await f.signIn()).toMatchObject({kind:'refused'});
 vi.mocked(f.sessions.create).mockRejectedValueOnce(new Error('session store failed'));await expect(f.signIn()).rejects.toThrow('session store failed');
 expect(await f.proof()).toEqual([]);expect((await f.enable()).ok).toBe(false);
});
it.each([
 ['client_id','replacement','client'],['client_secret_ref','secret://replacement','secret://test'],['issuer','https://replacement.example','https://idp.example'],['scope','openid email','openid email profile'],['discovery_url','https://idp.example/discovery',null],['display_name','Replacement','SSO'],
])('5.18 changing %s invalidates proof, including change-and-revert',async(column,value,original)=>{
 const f=await fixture();expect(await f.signIn()).toMatchObject({kind:'session'});
 const before=await f.configurations.find('oidc:generic',f.companyId);
 await withPlatform(tx=>tx.query(`UPDATE company_idp SET ${column}=$2 WHERE id=$1`,[f.idp,value]));
 expect((await f.enable()).ok).toBe(false);
 await withPlatform(tx=>tx.query(`UPDATE company_idp SET ${column}=$2 WHERE id=$1`,[f.idp,original]));
 expect((await f.configurations.find('oidc:generic',f.companyId))!.configurationVersion).not.toBe(before!.configurationVersion);
 expect((await f.enable()).ok).toBe(false);expect(await f.signIn()).toMatchObject({kind:'session'});expect((await f.enable()).ok).toBe(true);
});
it('5.18 callback rejects a changed pinned configuration before exchange, and a change during exchange before releasing the session',async()=>{
 const f=await fixture(),start=await f.begin();
 await withPlatform(tx=>tx.query("UPDATE company_idp SET client_id='changed' WHERE id=$1",[f.idp]));
 expect(await f.callback(start.state)).toMatchObject({kind:'refused'});expect(f.provider.exchange).not.toHaveBeenCalled();
 f.provider.exchange.mockImplementationOnce(async()=>{await withPlatform(tx=>tx.query("UPDATE company_idp SET scope='openid email' WHERE id=$1",[f.idp]));return {subject:'verified',email:f.user.email,emailVerified:true};});
 expect(await f.signIn()).toMatchObject({kind:'refused'});expect(f.sessions.revoke).toHaveBeenCalledTimes(1);expect(await f.proof()).toEqual([]);
});
it('5.18 enforced configuration cannot be edited; disabling allows changes but requires a new sign-in to re-enable',async()=>{
 const f=await fixture();await f.signIn();expect((await f.enable()).ok).toBe(true);
 for(const column of ['client_id','client_secret_ref','issuer','scope']){
  const value=column==='client_secret_ref'?'secret://new':column==='issuer'?'https://new.example':column==='scope'?'openid':'new';
  await expect(withPlatform(tx=>tx.query(`UPDATE company_idp SET ${column}=$2 WHERE id=$1`,[f.idp,value]))).rejects.toMatchObject({constraint:'company_sso_configuration_locked'});
 }
 expect((await f.configurations.find('oidc:generic',f.companyId))!.clientId).toBe('client');
 await f.disable();await withPlatform(tx=>tx.query("UPDATE company_idp SET client_id='new' WHERE id=$1",[f.idp]));expect((await f.enable()).ok).toBe(false);
});
it('5.18 enforcement and provider writes serialize on the company lock',async()=>{
 const f=await fixture();await f.signIn();
 const [enabled,changed]=await Promise.allSettled([f.enable(),withPlatform(tx=>tx.query("UPDATE company_idp SET client_id='concurrent' WHERE id=$1",[f.idp]))]);
 if(enabled.status==='fulfilled'&&enabled.value.ok){expect(changed.status).toBe('rejected');expect((await f.configurations.find('oidc:generic',f.companyId))!.clientId).toBe('client');}
 else{expect(changed.status).toBe('fulfilled');const view=await f.settings.company(f.companyId);expect(view.ok&&view.value.ssoEnforced).toBe(false);}
});
it('5.18 deleting and recreating a provider cannot inherit the old proof',async()=>{
 const f=await fixture();await f.signIn();await withPlatform(async tx=>{await tx.query('DELETE FROM company_idp WHERE id=$1',[f.idp]);await tx.query("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:generic','SSO','https://idp.example','client','secret://test')",[f.companyId]);});expect((await f.enable()).ok).toBe(false);
});
it('5.18 company settings HTTP write still requires company administration even with valid sign-in proof',async()=>{
 const f=await fixture();await f.signIn();
 const [{createHttpServer},{settingsRoutes},{allowBulk},{once}]=await Promise.all([import('../src/platform/http/index.js'),import('../src/modules/tenancy/api/settings-routes.js'),import('./fixtures/bulk-entitlements/fixture.js'),import('node:events')]);
 const view=await f.settings.company(f.companyId);if(!view.ok)throw view.error;
 const {id:_,enabledProviders:__,...body}=view.value;
 const server=createHttpServer(settingsRoutes(f.settings),{authorization:{currentUser:async()=>({id:f.user.id,email:f.user.email,fullName:null,timezone:'UTC',method:'oidc:generic',sessionCreatedAt:new SystemClock().now(),deviceConfirmed:true}),port:{...allowBulk,check:async request=>({...await allowBulk.check(request),allowed:request.permission==='view'})}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();if(!addr||typeof addr==='string')throw new Error();
 try{const reply=await fetch(`http://127.0.0.1:${addr.port}/api/v1/companies/${f.companyId}/settings`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...body,ssoEnforced:true})});expect(reply.status).toBe(403);}
 finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
