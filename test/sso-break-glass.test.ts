import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
import {withPlatform} from '../src/platform/db/scope.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {createRedisConnection} from '../src/platform/redis/index.js';
import {CompanyId,SystemClock,UuidV7IdFactory} from '../src/shared/kernel/index.js';
import {MagicLinkService} from '../src/modules/identity/application/magic-link.js';
import {CurrentUserService} from '../src/modules/identity/application/current-user.js';
import {PostgresIdentityRepository} from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import {PostgresMagicLinkAccess} from '../src/modules/identity/infrastructure/magic-link-access.js';
import {RedisSessionStore} from '../src/modules/identity/infrastructure/redis-session-store.js';
import {createProviderResolutionRuntime} from '../src/modules/identity/infrastructure/oidc-runtime.js';
import {magicLinkRoutes} from '../src/modules/identity/api/magic-link-routes.js';

const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(enforced=true){
 const domain=randomUUID()+'.example',clock=new SystemClock();
 const [company]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO company(name,default_region,allowed_domains) VALUES('Recovery','eu-west-1',$1) RETURNING id",[[domain]]));
 const companyId=CompanyId(company!.id);
 await withPlatform(async tx=>{
  await tx.query("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:generic','Company SSO','https://idp.example','client','secret://test')",[companyId]);
  await tx.query('UPDATE company SET sso_enforced=$2 WHERE id=$1',[companyId,enforced]);
 });
 const accounts=new PostgresIdentityRepository(clock),admin=await accounts.create('admin@'+domain,null),member=await accounts.create('member@'+domain,null);
 await withPlatform(tx=>tx.query("INSERT INTO company_member(company_id,user_id,role) VALUES($1,$2,'admin'),($1,$3,'member')",[companyId,admin.id,member.id]));
 await accounts.linkVerifiedIdentity(admin.id,'oidc:generic',admin.id);
 const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();cleanup.push(()=>redis.close());
 const sessions=new RedisSessionStore(redis.client,clock,new UuidV7IdFactory()),access=new PostgresMagicLinkAccess();
 const delivery={dispatch:vi.fn(async()=>{})};
 const service=new MagicLinkService(accounts,accounts,accounts,{check:async()=>({allowed:true,retryAfterSeconds:0})},sessions,clock,access,delivery);
 const current=new CurrentUserService(sessions,accounts,access);
 const request=(email=admin.email)=>service.requestLink({email,deviceNonce:'browser',ip:'192.0.2.1'});
 const callback=(token:string)=>({token,deviceNonce:'browser',ip:'192.0.2.1',userAgent:'test'});
 const audit=()=>withPlatform(tx=>tx.query<{actor_id:string|null;actor_kind:string;target:unknown;after:{stage:string}}>("SELECT actor_id,actor_kind,target,after FROM audit_entry WHERE company_id=$1 AND action='SsoBreakGlassUsed' ORDER BY occurred_at",[companyId]));
 return {companyId,domain,admin,member,accounts,sessions,access,service,current,delivery,request,callback,audit};
}

it('5.19 direct request-link POST sends identical responses but issues nothing for a non-administrator',async()=>{
 const f=await fixture(),server=createHttpServer(magicLinkRoutes(f.service));server.listen(0,'127.0.0.1');await once(server,'listening');
 cleanup.push(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
 const address=server.address();if(!address||typeof address==='string')throw new Error('No HTTP address');
 const post=(email:string)=>fetch(`http://127.0.0.1:${address.port}/api/v1/auth/request-link`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,deviceNonce:'browser'})});
 for(const email of [f.member.email,'unknown@'+f.domain]){const reply=await post(email);expect(reply.status).toBe(202);expect(await reply.text()).toBe('');}
 expect(await withPlatform(tx=>tx.query('SELECT id FROM magic_link_token WHERE email=$1',[f.member.email]))).toEqual([]);
 expect(await withPlatform(tx=>tx.query('SELECT id FROM mail_outbox WHERE to_email=$1',[f.member.email]))).toEqual([]);
 expect(f.delivery.dispatch).not.toHaveBeenCalled();
 const reply=await post(f.admin.email);expect(reply.status).toBe(202);expect(await reply.text()).toBe('');expect(f.delivery.dispatch).toHaveBeenCalledTimes(1);
});

it('5.19 provider resolution has the same recovery option for admin, member and unknown addresses',async()=>{
 const f=await fixture(),providers=createProviderResolutionRuntime();
 const admin=await providers.resolve(f.admin.email);
 expect(admin).toMatchObject({magicLink:true,enforced:'oidc:generic'});
 expect(await providers.resolve(f.member.email)).toEqual(admin);
 expect(await providers.resolve('unknown@'+f.domain)).toEqual(admin);
});

it.each([false,true])('5.19 administrator completes recovery (device confirmation %s), remains signed in, and every use is audited',async confirm=>{
 const f=await fixture(),issued=await f.request();expect(issued.token).not.toBeNull();
 const result=confirm?await f.service.confirm({...f.callback(issued.token!),deviceNonce:'other',confirm:true}):await f.service.callback(f.callback(issued.token!));
 expect(result.kind).toBe('session');if(result.kind!=='session')throw new Error('No session');
 expect(await f.current.read(result.sessionId)).toMatchObject({id:f.admin.id,method:'magic_link'});
 expect(await f.current.read(result.sessionId)).toMatchObject({id:f.admin.id});
 const rows=await f.audit();expect(rows.map(r=>r.after.stage)).toEqual(['link_issuance_authorized','sign_in_completed','session_accepted','session_accepted']);
 expect(rows[0]).toMatchObject({actor_id:null,actor_kind:'system',target:{companyId:f.companyId,userId:f.admin.id}});
 expect(rows.slice(1).every(r=>r.actor_id===f.admin.id&&r.actor_kind==='user')).toBe(true);
 expect(JSON.stringify(rows)).not.toContain(issued.token);expect(JSON.stringify(rows)).not.toContain(result.sessionId);
});

it.each([false,true])('5.19 a link issued before enforcement cannot complete for a member (device confirmation %s)',async confirm=>{
 const f=await fixture(false),issued=await f.request(f.member.email);expect(issued.token).not.toBeNull();
 await withPlatform(tx=>tx.query('UPDATE company SET sso_enforced=true WHERE id=$1',[f.companyId]));
 const create=vi.spyOn(f.sessions,'create');
 expect(confirm?await f.service.confirm({...f.callback(issued.token!),confirm:true}):await f.service.callback(f.callback(issued.token!))).toEqual({kind:'invalid'});
 expect(create).not.toHaveBeenCalled();expect(await f.audit()).toEqual([]);
});

it('5.19 old administrator sessions survive enforcement, members are revoked, and demotion revokes administrator recovery',async()=>{
 const f=await fixture(false),meta={ip:'192.0.2.1',userAgent:'test',deviceNonce:'browser'};
 const adminSession=await f.sessions.create(f.admin.id,meta,'magic_link',false),memberSession=await f.sessions.create(f.member.id,meta,'magic_link',false);
 await withPlatform(tx=>tx.query('UPDATE company SET sso_enforced=true WHERE id=$1',[f.companyId]));
 expect(await f.current.read(adminSession)).toMatchObject({id:f.admin.id});
 expect(await f.current.read(memberSession)).toBeNull();expect(await f.sessions.read(memberSession)).toBeNull();
 await withPlatform(tx=>tx.query("UPDATE company_member SET role='member' WHERE company_id=$1 AND user_id=$2",[f.companyId,f.admin.id]));
 expect(await f.current.read(adminSession)).toBeNull();expect(await f.sessions.read(adminSession)).toBeNull();
 expect((await f.audit()).map(r=>r.after.stage)).toEqual(['session_accepted']);
});

it('5.19 administering A never unlocks enforced B, even when the email domain belongs to A',async()=>{
 const a=await fixture(),b=await fixture();
 await withPlatform(tx=>tx.query("INSERT INTO company_member(company_id,user_id,role) VALUES($1,$2,'member')",[b.companyId,a.admin.id]));
 expect((await a.request()).token).toBeNull();expect(await a.audit()).toEqual([]);
 await withPlatform(tx=>tx.query("UPDATE company_member SET role='admin' WHERE company_id=$1 AND user_id=$2",[b.companyId,a.admin.id]));
 const issued=await a.request();expect(issued.token).not.toBeNull();
 expect((await a.audit()).map(r=>r.after.stage)).toEqual(['link_issuance_authorized']);expect((await b.audit()).map(r=>r.after.stage)).toEqual(['link_issuance_authorized']);
});

it('5.19 failed auditing releases no session and a role change during session creation is caught',async()=>{
 const f=await fixture(),issued=await f.request();
 const create=f.sessions.create.bind(f.sessions),revoke=vi.spyOn(f.sessions,'revoke');
 vi.spyOn(f.sessions,'create').mockImplementationOnce(async(...args)=>{const id=await create(...args);await withPlatform(tx=>tx.query("UPDATE company_member SET role='member' WHERE company_id=$1 AND user_id=$2",[f.companyId,f.admin.id]));return id;});
 expect(await f.service.callback(f.callback(issued.token!))).toEqual({kind:'invalid'});expect(revoke).toHaveBeenCalledTimes(1);
 await withPlatform(tx=>tx.query("UPDATE company_member SET role='admin' WHERE company_id=$1 AND user_id=$2",[f.companyId,f.admin.id]));
 const next=await f.request(),check=f.access.check.bind(f.access);
 vi.spyOn(f.access,'check').mockImplementation(async(email,use)=>{if(use?.stage==='sign_in_completed')throw new Error('audit unavailable');return check(email,use);});
 await expect(f.service.callback(f.callback(next.token!))).rejects.toThrow('audit unavailable');expect(revoke).toHaveBeenCalledTimes(2);
});

it('5.19 a pending administrator invitation is a restriction, not administrator proof',async()=>{
 const f=await fixture(),email=randomUUID()+'@external.example';
 await f.accounts.create(email,null);
 await withPlatform(tx=>tx.query("INSERT INTO pending_invite(email,company_id,role,token_hash,expires_at,created_by) VALUES($1,$2,'admin',$3,now()+interval '1 day',$4)",[email,f.companyId,Buffer.from(randomUUID()),f.admin.id]));
 expect((await f.request(email)).token).toBeNull();expect(f.delivery.dispatch).not.toHaveBeenCalled();
});

it('5.19 audit failure at issuance creates no token and OIDC sessions do not use the exception',async()=>{
 const f=await fixture();vi.spyOn(f.access,'check').mockRejectedValue(new Error('audit unavailable'));
 await expect(f.request()).rejects.toThrow('audit unavailable');
 expect(await withPlatform(tx=>tx.query('SELECT id FROM magic_link_token WHERE email=$1',[f.admin.email]))).toEqual([]);expect(f.delivery.dispatch).not.toHaveBeenCalled();
 const id=await f.sessions.create(f.member.id,{ip:'192.0.2.1',userAgent:'test',deviceNonce:'browser'},'oidc:generic',false);
 expect(await f.current.read(id)).toMatchObject({id:f.member.id,method:'oidc:generic'});
});

it('5.19 project administration alone cannot recover through an enforced company',async()=>{
 const f=await fixture(),account=await f.accounts.create(randomUUID()+'@external.example',null);
 const [project]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO project(company_id,name,region,industry_id) SELECT $1,'Recovery project','eu-west-1',id FROM industry LIMIT 1 RETURNING id",[f.companyId]));
 if(!project)throw new Error('Missing seeded industry');
 await withPlatform(tx=>tx.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'admin')",[project.id,account.id]));
 expect((await f.request(account.email)).token).toBeNull();
});
