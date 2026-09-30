import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
import {withPlatform} from '../src/platform/db/scope.js';
import {CompanyId,ProjectId,SystemClock,UuidV7IdFactory,SessionId} from '../src/shared/kernel/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
import {RelationshipOutbox} from '../src/modules/tenancy/application/relationship-outbox.js';
import {InvitationService} from '../src/modules/tenancy/application/invitations.js';
import {PostgresInvitationRepository} from '../src/modules/tenancy/infrastructure/invitation-repository.js';
import {OutboxInvitationDelivery} from '../src/modules/tenancy/infrastructure/invitation-delivery.js';
import {MailOutbox,LocalFileMailAdapter} from '../src/platform/mail/index.js';
import {PostgresIdentityRepository} from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import {createOidcRuntime} from '../src/modules/identity/infrastructure/oidc-runtime.js';
import {OpenIdClientAdapter} from '../src/modules/identity/infrastructure/openid-client-adapter.js';
import {RedisSessionStore} from '../src/modules/identity/infrastructure/redis-session-store.js';
import {createRedisConnection} from '../src/platform/redis/index.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {oidcRoutes} from '../src/modules/identity/api/oidc-routes.js';

const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(){
 const clock=new SystemClock(),domain=randomUUID()+'.example',email='invited@'+domain;
 const outbox=new RelationshipOutbox(),directory=await mkdtemp(join(tmpdir(),'opintel-sso-invitation-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const authorization:AuthorizationPort={check:async()=>({allowed:true,checkedAt:clock.now(),token:'test' as AuthorizationRevision,snapshotAgeMs:0}),checkMany:async()=>[],explain:async()=>({allowed:true,path:[]}),write:vi.fn(async()=> 'test' as AuthorizationRevision)};
 const invitations=new InvitationService(new PostgresInvitationRepository(outbox),authorization,clock,new OutboxInvitationDelivery(new MailOutbox(),new LocalFileMailAdapter(directory,clock,()=>{},'https://console.example')));
 const identity=new PostgresIdentityRepository(clock,invitations),creator=await identity.create('admin@'+domain,null);
 const [company]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO company(name,default_region,allowed_domains) VALUES('SSO invitations','eu-west-1',$1) RETURNING id",[[domain]]));const companyId=CompanyId(company!.id);
 const [project]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO project(company_id,name,region,industry_id) SELECT $1,'Invitations','eu-west-1',id FROM industry LIMIT 1 RETURNING id",[companyId]));const projectId=ProjectId(project!.id);
 const [idp]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:generic','Company SSO','https://idp.example','client','secret://test') RETURNING id",[companyId]));
 await withPlatform(tx=>tx.query('UPDATE company SET sso_enforced=true WHERE id=$1',[companyId]));
 const created=await invitations.create({email,companyId,projectId,role:'viewer'},projectId,creator.id);if(!created.ok)throw created.error;const invitation=created.value;
 const files=await readdir(directory);const mail=JSON.parse(await readFile(join(directory,files[0]!),'utf8')) as {template:string;vars:{url:string}};
 const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();cleanup.push(()=>redis.close());
 const sessions=new RedisSessionStore(redis.client,clock,new UuidV7IdFactory());
 vi.spyOn(OpenIdClientAdapter.prototype,'authorizationUrl').mockImplementation(async(_config,state)=>'https://idp.example/authorize?state='+state);
 const exchange=vi.spyOn(OpenIdClientAdapter.prototype,'exchange').mockResolvedValue({subject:randomUUID(),email,emailVerified:true});
 const oidc=createOidcRuntime(redis.client,identity,identity,sessions,clock),server=createHttpServer(oidcRoutes(oidc,'https://console.example'));
 server.listen(0,'127.0.0.1');await once(server,'listening');cleanup.push(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
 const address=server.address();if(!address||typeof address==='string')throw new Error('No address');const base=`http://127.0.0.1:${address.port}`;
 let replayCallback: (()=>Promise<Response>)|undefined;
 const replay=()=>{if(!replayCallback)throw new Error('No callback');return replayCallback();};
 const signIn=async(link=mail.vars.url)=>{const url=new URL(link);const start=await fetch(base+url.pathname+url.search,{redirect:'manual'});expect(start.status).toBe(302);const state=new URL(start.headers.get('location')!).searchParams.get('state')!;replayCallback=()=>fetch(`${base}/auth/oidc/oidc:generic/callback?state=${state}&code=ok`,{redirect:'manual',headers:{cookie:start.headers.get('set-cookie')!.split(';')[0]!}});return replayCallback();};
 const pending=()=>withPlatform(tx=>tx.query<{accepted_at:Date|null}>('SELECT accepted_at FROM pending_invite WHERE id=$1',[invitation.id]));
 const members=()=>withPlatform(tx=>tx.query('SELECT user_id FROM project_member WHERE project_id=$1',[projectId]));
 return {companyId,projectId,idp:idp!.id,email,invitation,mail,signIn,replay,exchange,pending,members,sessions,invitations,identity,authorization};
}

it('5.19 production mail and OIDC routes deliver the company provider and accept one existing invitation after creating the session',async()=>{
 const f=await fixture();expect(f.mail.template).toBe('invitation');const url=new URL(f.mail.vars.url);
 expect(url.origin).toBe('https://console.example');expect(url.pathname).toBe('/auth/oidc/oidc:generic/start');expect(url.searchParams.get('companyId')).toBe(f.companyId);expect(url.searchParams.get('inviteId')).toBe(f.invitation.id);
 expect(await withPlatform(tx=>tx.query('SELECT id FROM magic_link_token WHERE invite_id=$1',[f.invitation.id]))).toEqual([]);
 const create=f.sessions.create.bind(f.sessions);vi.spyOn(f.sessions,'create').mockImplementation(async(...args)=>{expect(await f.pending()).toEqual([{accepted_at:null}]);expect(await f.members()).toEqual([]);return create(...args);});
 const reply=await f.signIn();expect(reply.status,await reply.clone().text()).toBe(302);
 const sessionId=SessionId(reply.headers.get('set-cookie')!.split(';')[0]!.split('=')[1]!);expect(await f.sessions.read(sessionId)).toMatchObject({method:'oidc:generic'});
 expect((await f.pending())[0]!.accepted_at).not.toBeNull();expect(await f.members()).toHaveLength(1);expect(f.authorization.write).toHaveBeenCalledTimes(1);
 expect((await f.invitations.list(f.projectId,null,20)).ok).toBe(true);
});

it.each(['provider','session','configuration','email'] as const)('5.19 a failed %s step leaves the invitation pending and grants nothing',async failure=>{
 const f=await fixture();
 if(failure==='provider')f.exchange.mockRejectedValueOnce(new Error('not provisioned or abandoned'));
 if(failure==='email')f.exchange.mockResolvedValueOnce({subject:randomUUID(),email:'other@'+f.email.split('@')[1],emailVerified:true});
 if(failure==='session')vi.spyOn(f.sessions,'create').mockRejectedValueOnce(new Error('session unavailable'));
 if(failure==='configuration'){const create=f.sessions.create.bind(f.sessions);vi.spyOn(f.sessions,'create').mockImplementationOnce(async(...args)=>{const session=await create(...args);await withPlatform(async tx=>{await tx.query('UPDATE company SET sso_enforced=false WHERE id=$1',[f.companyId]);await tx.query("UPDATE company_idp SET client_id='changed' WHERE id=$1",[f.idp]);});return session;});}
 expect((await f.signIn()).status).toBeGreaterThanOrEqual(400);expect(await f.pending()).toEqual([{accepted_at:null}]);expect(await f.members()).toEqual([]);
 const list=await f.invitations.list(f.projectId,null,20);expect(list.ok&&list.value.items).toEqual([expect.objectContaining({id:f.invitation.id,status:'pending'})]);
 if(failure!=='configuration'){expect((await f.signIn()).status).toBe(302);expect((await f.pending())[0]!.accepted_at).not.toBeNull();expect(await f.members()).toHaveLength(1);}
});

it('5.19 changing the invitation URL to another company provider never accepts the invitation',async()=>{
 const f=await fixture();const [other]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Other IdP','eu-west-1') RETURNING id"));
 await withPlatform(tx=>tx.query("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:generic','Other','https://other.example','client','secret://test')",[other!.id]));
 const url=new URL(f.mail.vars.url);url.searchParams.set('companyId',other!.id);
 expect((await f.signIn(url.toString())).status).toBe(401);expect(await f.pending()).toEqual([{accepted_at:null}]);expect(await f.members()).toEqual([]);
});

it('5.19 acceptance independently checks company and pinned provider configuration',async()=>{
 const f=await fixture(),user=await f.identity.create(f.email,null);
 for(const proof of [
  {method:'oidc' as const,sessionId:SessionId(randomUUID()),companyId:null,idpId:null,configurationVersion:'platform'},
  {method:'magic_link' as const,sessionId:SessionId(randomUUID())},
 ]){expect(await f.invitations.accept(f.invitation.id,user.id,proof)).toMatchObject({ok:false,error:{code:'forbidden'}});}
 expect(await f.pending()).toEqual([{accepted_at:null}]);expect(await f.members()).toEqual([]);
});

it('5.19 OIDC dispatch failure rolls back acceptance and outbox, revokes the session and permits a fresh provider flow',async()=>{
 const f=await fixture();
 const create=vi.spyOn(f.sessions,'create');
 vi.mocked(f.authorization.write).mockImplementationOnce(async()=>{
  expect(await f.pending()).toEqual([{accepted_at:null}]);
  expect(await f.members()).toEqual([]);
  expect(await withPlatform(tx=>tx.query('SELECT id FROM relationship_outbox WHERE resource_id=$1',[f.projectId]))).toEqual([]);
  throw new Error('SpiceDB unavailable');
 });
 const response=await f.signIn();
 expect(response.status).toBeGreaterThanOrEqual(400);
 expect(await response.text()).toContain('Your invitation is still pending. Start sign-in again');
 expect(response.headers.get('set-cookie') ?? '').not.toContain('opintel_session=');
 expect(await f.pending()).toEqual([{accepted_at:null}]);expect(await f.members()).toEqual([]);
 expect(await withPlatform(tx=>tx.query('SELECT id FROM relationship_outbox WHERE resource_id=$1',[f.projectId]))).toEqual([]);
 expect(await f.sessions.read(await create.mock.results[0]!.value)).toBeNull();
 expect((await f.replay()).status).toBeGreaterThanOrEqual(400);
 expect(f.authorization.write).toHaveBeenCalledTimes(1);
 expect((await f.signIn()).status).toBe(302);
 expect((await f.pending())[0]!.accepted_at).not.toBeNull();expect(await f.members()).toHaveLength(1);
 expect(await withPlatform(tx=>tx.query('SELECT written_at,authorization_revision FROM relationship_outbox WHERE resource_id=$1',[f.projectId]))).toEqual([{written_at:expect.any(Date),authorization_revision:'test'}]);
});
